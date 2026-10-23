/**
 * Signing in.
 *
 * One password, one session cookie. The password is stored as a scrypt hash
 * (see `password.ts`); the cookie holds a random token and the table holds only
 * its SHA-256, so a copy of the database cannot be turned into a working
 * cookie.
 *
 * A wrong password costs the same whether the email exists or not, and too many
 * wrong passwords put the account on a short hold. Neither of those is about
 * looking clever: they are what stops someone with the app's address from
 * guessing in a loop.
 */

import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, lt } from 'drizzle-orm';

import type { Database } from './client.ts';
import { hashPassword, passwordProblem, verifyPassword } from './password.ts';
import { sessions, users } from './schema.ts';
import { verifySecondFactor } from './two-factor.ts';

/** How long a sign-in lasts. */
export const SESSION_DAYS = 7;

/** How many wrong passwords in a row put the account on hold. */
export const MAX_FAILED_LOGINS = 5;

/** How long the hold lasts. */
export const LOCK_MINUTES = 15;

/**
 * Why signing in did not work.
 *
 * `totp` means the password was right and a code is needed; `totp-invalid`
 * means the code was wrong. Neither is reachable before the password is right,
 * so they say nothing about whether an address exists.
 */
export type SignInFailure =
  'no-password' | 'wrong' | 'locked' | 'disabled' | 'totp' | 'totp-invalid' | 'totp-unavailable';

/** The outcome of trying to sign in. */
export type SignInResult =
  | { ok: true; token: string; expiresAt: Date; userId: string }
  | { ok: false; reason: SignInFailure; lockedUntil?: Date };

/**
 * Whether a session has run out.
 *
 * @example
 * isExpired(new Date('2020-01-01'), new Date('2026-01-01')); // true
 */
export function isExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** The moment a new session stops being accepted. */
export function expiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

/** The value stored for a session token: its SHA-256, in hex. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A new session token. It is only ever in the cookie. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Whether the user has set a password yet. */
export async function hasPassword(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(rows[0]?.passwordHash);
}

/**
 * Whether a password is the one the account has now.
 *
 * Asked before a change that could lock the owner out — turning two-factor on
 * or off, moving the address — so a session someone left open is not enough.
 *
 * @example
 * if (!(await verifyCurrentPassword(db, userId, password))) return denied();
 */
export async function verifyCurrentPassword(
  db: Database,
  userId: string,
  password: string,
): Promise<boolean> {
  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const hash = rows[0]?.passwordHash;
  if (!hash) return false;
  return verifyPassword(hash, password);
}

/**
 * Sets (or replaces) the password of a user.
 *
 * Setting it clears a hold and the failed attempts that caused it: whoever
 * can set the password controls the account.
 *
 * @example
 * await setPassword(db, userId, 'correct horse battery staple');
 */
export async function setPassword(db: Database, userId: string, password: string): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

/**
 * Signs a user in with a password.
 *
 * @example
 * const result = await signIn(db, { email, password });
 * if (result.ok) setCookie(result.token);
 */
export async function signIn(
  db: Database,
  input: {
    email: string;
    password: string;
    /** The code from the authenticator app, or a recovery code. */
    totpCode?: string | null;
    /** The key that decrypts the stored secret, when two-factor is on. */
    encryptionKey?: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  now: Date = new Date(),
): Promise<SignInResult> {
  const rows = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      failedLoginCount: users.failedLoginCount,
      lockedUntil: users.lockedUntil,
      totpSecret: users.totpSecretEncrypted,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.email, input.email.trim().toLowerCase()))
    .limit(1);

  const user = rows[0];

  // An unknown email and a wrong password take the same path and the same
  // words: a hash is verified either way, so the answer does not say which.
  if (!user || !user.passwordHash) {
    await verifyPassword(await decoyHash(), input.password);
    return { ok: false, reason: 'wrong' };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    return { ok: false, reason: 'locked', lockedUntil: user.lockedUntil };
  }

  if (await verifyPassword(user.passwordHash, input.password)) {
    /*
      The password is the first factor; the code is the second. Asking for the
      code only after the password is right keeps the form from telling a
      stranger that this account has one.
    */
    if (user.totpEnabledAt) {
      const code = input.totpCode?.trim();
      if (!code) return { ok: false, reason: 'totp' };

      const second = await verifySecondFactor(db, {
        userId: user.id,
        encryptedSecret: user.totpSecret,
        code,
        encryptionKey: input.encryptionKey,
        now,
      });

      if (second.status === 'unavailable') {
        return { ok: false, reason: 'totp-unavailable' };
      }
      if (second.status === 'invalid') {
        const failure = await recordFailedAttempt(db, user, now);
        if (!failure.ok && failure.reason !== 'locked') {
          return { ...failure, reason: 'totp-invalid' };
        }
        return failure;
      }
    }

    const token = newSessionToken();
    const expiresAt = expiryFrom(now);

    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt,
      lastSeenAt: now,
      createdIp: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    await db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
      .where(eq(users.id, user.id));

    // Sessions that are already over are no use to anyone.
    await db.delete(sessions).where(lt(sessions.expiresAt, now));

    return { ok: true, token, expiresAt, userId: user.id };
  }

  return recordFailedAttempt(db, user, now);
}

/**
 * Counts a wrong guess and puts the account on hold when they add up.
 *
 * A wrong password and a wrong code both count: they are the same person
 * guessing at the same account.
 */
async function recordFailedAttempt(
  db: Database,
  user: { id: string; failedLoginCount: number },
  now: Date,
): Promise<SignInResult> {
  const failed = user.failedLoginCount + 1;
  const lockedUntil =
    failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) : null;

  await db
    .update(users)
    .set({
      failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
      lockedUntil,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  if (lockedUntil) return { ok: false, reason: 'locked', lockedUntil };
  return { ok: false, reason: 'wrong' };
}

/**
 * The user behind a session token, or null.
 *
 * An expired session is deleted when it is found, so the table does not fill
 * with dead cookies.
 *
 * @example
 * const userId = await resolveSession(db, tokenFromCookie);
 */
export async function resolveSession(
  db: Database,
  token: string,
  now: Date = new Date(),
): Promise<string | null> {
  if (!token) return null;

  const rows = await db
    .select({ id: sessions.id, userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const session = rows[0];
  if (!session) return null;

  if (isExpired(session.expiresAt, now)) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  // A sign-in that is being used stays fresh, so the list of sessions means
  // something. It is not extended: the session still ends when it ends.
  await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, session.id));

  return session.userId;
}

/**
 * Ends one session.
 *
 * @example
 * await signOut(db, tokenFromCookie);
 */
export async function signOut(db: Database, token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Ends every session of a user, except the one given when it is known. */
export async function signOutEverywhere(
  db: Database,
  userId: string,
  keepToken?: string,
): Promise<void> {
  const keep = keepToken ? hashToken(keepToken) : null;
  const rows = await db
    .select({ id: sessions.id, tokenHash: sessions.tokenHash })
    .from(sessions)
    .where(eq(sessions.userId, userId));

  for (const row of rows) {
    if (keep && row.tokenHash === keep) continue;
    await db.delete(sessions).where(eq(sessions.id, row.id));
  }
}

/**
 * The account behind a session, as the settings screen shows it.
 *
 * @example
 * const account = await getAccount(db, userId);
 */
export async function getAccount(
  db: Database,
  userId: string,
): Promise<{
  id: string;
  email: string;
  displayName: string;
  lastLoginAt: Date | null;
  createdAt: Date;
} | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Changes the address the app signs in with.
 *
 * The current password is required: the address is how someone finds the
 * account, and only the person with the password should be able to move it.
 *
 * @example
 * await changeEmail(db, userId, 'old password', 'me@example.com');
 */
export async function changeEmail(
  db: Database,
  userId: string,
  currentPassword: string,
  newEmail: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const stored = rows[0]?.passwordHash;
  if (!stored || !(await verifyPassword(stored, currentPassword))) {
    return { ok: false, error: 'That is not the current password.' };
  }

  const email = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'That does not look like an email address.' };
  }

  const taken = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (taken[0] && taken[0].id !== userId) {
    return { ok: false, error: 'Another account already uses that address.' };
  }

  await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, userId));
  return { ok: true, email };
}

/**
 * The id of the session a token belongs to.
 *
 * The settings screen uses it to say which machine is the one you are looking
 * at. The token hash never leaves the server.
 *
 * @example
 * const id = await sessionIdForToken(db, tokenFromCookie);
 */
export async function sessionIdForToken(db: Database, token: string): Promise<string | null> {
  if (!token) return null;
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Ends one session by its id, as long as it belongs to the user.
 *
 * @example
 * await revokeSession(db, userId, sessionId);
 */
export async function revokeSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  return rows.length > 0;
}

/**
 * Changes the password, but only for someone who knows the current one.
 *
 * Every other session is ended, because a changed password should get anyone
 * else out.
 *
 * @example
 * await changePassword(db, userId, currentToken, 'old one', 'new one');
 */
export async function changePassword(
  db: Database,
  userId: string,
  currentToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const stored = rows[0]?.passwordHash;
  if (!stored || !(await verifyPassword(stored, currentPassword))) {
    return { ok: false, error: 'That is not the current password.' };
  }

  await setPassword(db, userId, newPassword);
  await signOutEverywhere(db, userId, currentToken);
  return { ok: true };
}

/** The sessions of a user that are still good, for "where am I signed in". */
export async function listSessions(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<{ id: string; lastSeenAt: Date; createdAt: Date; userAgent: string | null }[]> {
  const rows = await db
    .select({
      id: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      createdAt: sessions.createdAt,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, now)));

  return rows;
}

/**
 * A hash to check against when there is no user.
 *
 * Verifying against it costs the same as verifying a real password, so the
 * time an answer takes does not say whether the email exists.
 */
let cachedDecoy: string | null = null;
async function decoyHash(): Promise<string> {
  cachedDecoy ??= await hashPassword(randomBytes(24).toString('base64url'));
  return cachedDecoy;
}
