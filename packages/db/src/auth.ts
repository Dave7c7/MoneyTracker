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

/** How long a sign-in lasts. */
export const SESSION_DAYS = 7;

/** How many wrong passwords in a row put the account on hold. */
export const MAX_FAILED_LOGINS = 5;

/** How long the hold lasts. */
export const LOCK_MINUTES = 15;

/** Why signing in did not work. */
export type SignInFailure = 'no-password' | 'wrong' | 'locked' | 'disabled';

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
