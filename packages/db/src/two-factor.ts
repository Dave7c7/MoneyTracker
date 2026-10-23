/**
 * Two-factor sign-in, stored.
 *
 * The authenticator's secret is encrypted with `ENCRYPTION_KEY` before it is
 * written, the same way provider tokens are: a copy of the database on its own
 * cannot produce a code. The recovery codes are stored as SHA-256 hashes and
 * are spent one at a time, because a phone that is lost is exactly when they
 * are needed.
 *
 * The algorithm itself is in `totp.ts`; this file is the part that touches the
 * database.
 */

import { and, count, eq, isNull } from 'drizzle-orm';

import type { Database } from './client.ts';
import { decryptSecret, encryptSecret } from './credentials.ts';
import { recoveryCodes, users } from './schema.ts';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normaliseRecoveryCode,
  normaliseTotpCode,
  otpauthUri,
  TOTP_DIGITS,
  verifyTotp,
} from './totp.ts';

/** What the account screen shows about two-factor. */
export interface TwoFactorStatus {
  /** A code is required at sign-in. */
  enabled: boolean;
  /** When it was turned on. */
  enabledAt: Date | null;
  /** A secret has been made but not yet confirmed by a code. */
  pending: boolean;
  /** Codes that have not been used yet. */
  recoveryCodesLeft: number;
}

/** The message shown when there is no key to encrypt the secret with. */
export const MISSING_KEY_MESSAGE =
  'Two-factor needs ENCRYPTION_KEY to be set. Generate one with `openssl rand -hex 32`, ' +
  'add it to .env, restart the app, and try again.';

/** Reads the state of two-factor for one account. */
export async function getTwoFactorStatus(
  db: Database,
  userId: string,
): Promise<TwoFactorStatus> {
  const rows = await db
    .select({
      encrypted: users.totpSecretEncrypted,
      enabledAt: users.totpEnabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const left = await db
    .select({ value: count() })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));

  const row = rows[0];
  return {
    enabled: Boolean(row?.enabledAt),
    enabledAt: row?.enabledAt ?? null,
    pending: Boolean(row?.encrypted) && !row?.enabledAt,
    recoveryCodesLeft: left[0]?.value ?? 0,
  };
}

/**
 * Makes a secret and stores it, waiting for a code to confirm it.
 *
 * Starting over while two-factor is on is refused: turning it off is a
 * separate, deliberate step, so a session left open cannot quietly replace the
 * authenticator.
 *
 * @example
 * const started = await startTwoFactor(db, userId, encryptionKey);
 */
export async function startTwoFactor(
  db: Database,
  userId: string,
  encryptionKey: string | undefined,
): Promise<{ ok: true; secret: string; uri: string } | { ok: false; error: string }> {
  if (!encryptionKey) return { ok: false, error: MISSING_KEY_MESSAGE };

  const rows = await db
    .select({ email: users.email, enabledAt: users.totpEnabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) return { ok: false, error: 'There is no account to set this up for.' };
  if (user.enabledAt) {
    return { ok: false, error: 'Two-factor is already on. Turn it off first to replace it.' };
  }

  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({
      totpSecretEncrypted: encryptSecret(secret, encryptionKey),
      totpEnabledAt: null,
      totpLastStep: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { ok: true, secret, uri: otpauthUri({ secret, account: user.email }) };
}

/**
 * Turns two-factor on, once a code from the app confirms the secret.
 *
 * The recovery codes are returned in clear text here and nowhere else: they
 * are stored as hashes, so this is the only moment they can be written down.
 *
 * @example
 * const done = await confirmTwoFactor(db, userId, key, '287082');
 * done.recoveryCodes; // eight codes
 */
export async function confirmTwoFactor(
  db: Database,
  userId: string,
  encryptionKey: string | undefined,
  code: string,
  now: Date = new Date(),
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  if (!encryptionKey) return { ok: false, error: MISSING_KEY_MESSAGE };

  const rows = await db
    .select({ encrypted: users.totpSecretEncrypted, enabledAt: users.totpEnabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];

  if (!user?.encrypted) {
    return { ok: false, error: 'Start the setup first: there is no secret waiting to be confirmed.' };
  }
  if (user.enabledAt) return { ok: false, error: 'Two-factor is already on.' };

  const secret = decryptSecret(user.encrypted, encryptionKey);
  const checked = verifyTotp(secret, code, { time: now });
  if (!checked.ok) {
    return { ok: false, error: 'That code is not right. Codes change every thirty seconds.' };
  }

  const codes = generateRecoveryCodes();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        totpEnabledAt: now,
        /*
          The confirming code does not spend its step. Confirming is not a
          sign-in, and the person usually signs in moments later with the very
          code still on their screen; marking it used would turn that into
          "that code is not right" for half a minute.
        */
        totpLastStep: null,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    // A new enrolment replaces any codes from an earlier one.
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await tx
      .insert(recoveryCodes)
      .values(codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })));
  });

  return { ok: true, recoveryCodes: codes };
}

/**
 * Turns two-factor off and forgets the secret and the recovery codes.
 *
 * The caller checks the password: this is the step that makes a stolen session
 * less useful, not one that should be a single click.
 */
export async function disableTwoFactor(db: Database, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        totpSecretEncrypted: null,
        totpEnabledAt: null,
        totpLastStep: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  });
}

/**
 * Checks the second factor at sign-in: a code from the app, or a recovery code.
 *
 * A code that was already used is refused, and a recovery code is spent in the
 * same statement that finds it, so two requests cannot both use one.
 *
 * @example
 * await verifySecondFactor(db, { userId, encryptedSecret, code, encryptionKey });
 */
export async function verifySecondFactor(
  db: Database,
  input: {
    userId: string;
    encryptedSecret: string | null;
    code: string;
    encryptionKey: string | undefined;
    now?: Date;
  },
): Promise<{ status: 'ok' | 'invalid' | 'unavailable' }> {
  const now = input.now ?? new Date();
  const typed = normaliseTotpCode(input.code);

  if (new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(typed)) {
    if (!input.encryptedSecret || !input.encryptionKey) return { status: 'unavailable' };

    let secret: string;
    try {
      secret = decryptSecret(input.encryptedSecret, input.encryptionKey);
    } catch {
      // The key changed, or the row was edited. Either way no code can match,
      // and this is not the person's fault: say so instead of counting it as a
      // wrong guess.
      return { status: 'unavailable' };
    }

    // The step that last worked is read here, not trusted from the caller: a
    // replay is refused even if the caller forgot to pass it.
    const rows = await db
      .select({ lastStep: users.totpLastStep })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    const checked = verifyTotp(secret, typed, {
      time: now,
      lastStep: rows[0]?.lastStep ?? null,
    });
    if (!checked.ok || checked.step === null) return { status: 'invalid' };

    await db
      .update(users)
      .set({ totpLastStep: checked.step, updatedAt: now })
      .where(eq(users.id, input.userId));

    return { status: 'ok' };
  }

  // Not six digits, so it can only be a recovery code.
  const hash = hashRecoveryCode(normaliseRecoveryCode(input.code));
  const spent = await db
    .update(recoveryCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(recoveryCodes.userId, input.userId),
        eq(recoveryCodes.codeHash, hash),
        isNull(recoveryCodes.usedAt),
      ),
    )
    .returning({ id: recoveryCodes.id });

  return spent.length > 0 ? { status: 'ok' } : { status: 'invalid' };
}
