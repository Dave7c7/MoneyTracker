/**
 * Integration tests for two-factor sign-in.
 *
 * These need a real Postgres, like the other database tests. They check the
 * parts that touch the database: the encrypted secret, the one-time recovery
 * codes, the replay refusal, and what signing in does when a code is missing,
 * wrong, or right.
 */

import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabase, type Database } from '../src/client.ts';
import { ensureDefaultCategories, ensureLocalUser } from '../src/bootstrap.ts';
import { MAX_FAILED_LOGINS, setPassword, signIn } from '../src/auth.ts';
import { loadDotEnv } from '../src/env.ts';
import { recoveryCodes, users } from '../src/schema.ts';
import { totpCode, TOTP_PERIOD_SECONDS } from '../src/totp.ts';
import {
  confirmTwoFactor,
  disableTwoFactor,
  getTwoFactorStatus,
  MISSING_KEY_MESSAGE,
  startTwoFactor,
  verifySecondFactor,
} from '../src/two-factor.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

const EMAIL = 'two-factor@example.com';
const PASSWORD = 'correct horse battery staple';
/** 32 bytes of hex, the shape ENCRYPTION_KEY has. */
const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);
/** A fixed moment, so a test never straddles the end of a step. */
const NOW = new Date('2026-10-23T12:00:00.000Z');
const LATER = new Date(NOW.getTime() + TOTP_PERIOD_SECONDS * 1000);

describe.skipIf(!testDatabaseUrl)('two-factor', () => {
  let db: Database;
  let userId: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const created = createDatabase(testDatabaseUrl!, { max: 4 });
    db = created.db;
    close = () => created.pool.end();
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table recovery_codes, sessions, category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, import_profiles, connection_accounts, connections, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: EMAIL,
      displayName: 'Two Factor',
      timeZone: 'UTC',
    });
    userId = user.id;
    await ensureDefaultCategories(db, userId);
    await setPassword(db, userId, PASSWORD);
  });

  /** Starts and confirms an enrolment, returning the secret and the codes. */
  async function enrol(): Promise<{ secret: string; codes: string[] }> {
    const started = await startTwoFactor(db, userId, KEY);
    if (!started.ok) throw new Error(started.error);

    const code = totpCode(started.secret, NOW);
    const confirmed = await confirmTwoFactor(db, userId, KEY, code, NOW);
    if (!confirmed.ok) throw new Error(confirmed.error);

    return { secret: started.secret, codes: confirmed.recoveryCodes };
  }

  /** The stored, encrypted secret, as the sign-in path would read it. */
  async function storedSecret(): Promise<string | null> {
    const rows = await db
      .select({ encrypted: users.totpSecretEncrypted })
      .from(users)
      .where(eq(users.id, userId));
    return rows[0]?.encrypted ?? null;
  }

  it('starts off', async () => {
    expect(await getTwoFactorStatus(db, userId)).toEqual({
      enabled: false,
      enabledAt: null,
      pending: false,
      recoveryCodesLeft: 0,
    });
  });

  it('refuses to start without a key to encrypt the secret with', async () => {
    const started = await startTwoFactor(db, userId, undefined);
    expect(started).toEqual({ ok: false, error: MISSING_KEY_MESSAGE });

    const rows = await db
      .select({ encrypted: users.totpSecretEncrypted })
      .from(users)
      .where(eq(users.id, userId));
    expect(rows[0]?.encrypted).toBeNull();
  });

  it('stores the secret encrypted, and the account is not on until a code confirms it', async () => {
    const started = await startTwoFactor(db, userId, KEY);
    if (!started.ok) throw new Error(started.error);

    const rows = await db
      .select({ encrypted: users.totpSecretEncrypted })
      .from(users)
      .where(eq(users.id, userId));
    const stored = rows[0]?.encrypted ?? '';

    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain(started.secret);

    const status = await getTwoFactorStatus(db, userId);
    expect(status.pending).toBe(true);
    expect(status.enabled).toBe(false);
  });

  it('returns a link an authenticator app can use', async () => {
    const started = await startTwoFactor(db, userId, KEY);
    if (!started.ok) throw new Error(started.error);

    expect(started.uri).toContain(`secret=${started.secret}`);
    expect(started.uri).toContain(encodeURIComponent(EMAIL));
  });

  it('does not turn on for a wrong code', async () => {
    const started = await startTwoFactor(db, userId, KEY);
    if (!started.ok) throw new Error(started.error);

    const confirmed = await confirmTwoFactor(db, userId, KEY, '000000', NOW);
    expect(confirmed.ok).toBe(false);

    const status = await getTwoFactorStatus(db, userId);
    expect(status.enabled).toBe(false);
    expect(status.recoveryCodesLeft).toBe(0);
  });

  it('turns on with the right code, and hands out eight recovery codes just once', async () => {
    const { secret, codes } = await enrol();

    expect(codes).toHaveLength(8);

    // The confirming code did not spend its step: signing in right away with
    // the code still on the screen works.
    const signingIn = await signIn(
      db,
      { email: EMAIL, password: PASSWORD, totpCode: totpCode(secret, NOW), encryptionKey: KEY },
      NOW,
    );
    expect(signingIn.ok).toBe(true);

    const status = await getTwoFactorStatus(db, userId);
    expect(status.enabled).toBe(true);
    expect(status.pending).toBe(false);
    expect(status.recoveryCodesLeft).toBe(8);

    // Only hashes are stored.
    const stored = await db
      .select({ hash: recoveryCodes.codeHash })
      .from(recoveryCodes)
      .where(eq(recoveryCodes.userId, userId));
    expect(stored).toHaveLength(8);
    for (const row of stored) expect(row.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses to start over while it is already on', async () => {
    await enrol();

    const again = await startTwoFactor(db, userId, KEY);
    expect(again.ok).toBe(false);
  });

  it('verifies a code, then refuses to verify the same one again', async () => {
    const { secret } = await enrol();

    const encrypted = await storedSecret();
    const code = totpCode(secret, LATER);

    const first = await verifySecondFactor(db, {
      userId,
      encryptedSecret: encrypted,
      code,
      encryptionKey: KEY,
      now: LATER,
    });
    expect(first).toEqual({ status: 'ok' });

    const replay = await verifySecondFactor(db, {
      userId,
      encryptedSecret: encrypted,
      code,
      encryptionKey: KEY,
      now: LATER,
    });
    expect(replay).toEqual({ status: 'invalid' });
  });

  it('accepts a recovery code once, then never again', async () => {
    const { codes } = await enrol();
    const encrypted = await storedSecret();

    const typed = (codes[0] ?? 'not-a-code').toLowerCase();
    expect(
      await verifySecondFactor(db, { userId, encryptedSecret: encrypted, code: typed, encryptionKey: KEY, now: NOW }),
    ).toEqual({ status: 'ok' });

    expect(
      await verifySecondFactor(db, { userId, encryptedSecret: encrypted, code: typed, encryptionKey: KEY, now: NOW }),
    ).toEqual({ status: 'invalid' });

    const status = await getTwoFactorStatus(db, userId);
    expect(status.recoveryCodesLeft).toBe(7);
  });

  it('refuses when the key no longer opens the secret, without calling it a wrong guess', async () => {
    const { secret } = await enrol();

    const result = await verifySecondFactor(db, {
      userId,
      encryptedSecret: await storedSecret(),
      code: totpCode(secret, NOW),
      encryptionKey: OTHER_KEY,
      now: NOW,
    });

    expect(result).toEqual({ status: 'unavailable' });
  });

  it('turns off and forgets the secret and the recovery codes', async () => {
    await enrol();
    await disableTwoFactor(db, userId);

    const status = await getTwoFactorStatus(db, userId);
    expect(status).toEqual({
      enabled: false,
      enabledAt: null,
      pending: false,
      recoveryCodesLeft: 0,
    });

    const rows = await db
      .select({ encrypted: users.totpSecretEncrypted })
      .from(users)
      .where(eq(users.id, userId));
    expect(rows[0]?.encrypted).toBeNull();

    expect(await db.select().from(recoveryCodes)).toHaveLength(0);
  });

  describe('signing in', () => {
    it('asks for a code after the password, and gives no session yet', async () => {
      await enrol();

      const result = await signIn(db, { email: EMAIL, password: PASSWORD, encryptionKey: KEY }, NOW);
      expect(result).toEqual({ ok: false, reason: 'totp' });
    });

    it('signs in with the password and a code from the app', async () => {
      const { secret } = await enrol();

      const result = await signIn(
        db,
        {
          email: EMAIL,
          password: PASSWORD,
          totpCode: totpCode(secret, LATER),
          encryptionKey: KEY,
        },
        LATER,
      );

      expect(result.ok).toBe(true);
    });

    it('signs in with a recovery code', async () => {
      const { codes } = await enrol();

      const result = await signIn(
        db,
        { email: EMAIL, password: PASSWORD, totpCode: codes[3], encryptionKey: KEY },
        NOW,
      );
      expect(result.ok).toBe(true);
    });

    it('counts a wrong code as a failed attempt', async () => {
      await enrol();

      const result = await signIn(
        db,
        { email: EMAIL, password: PASSWORD, totpCode: '000000', encryptionKey: KEY },
        NOW,
      );
      expect(result).toEqual({ ok: false, reason: 'totp-invalid' });

      const rows = await db
        .select({ failed: users.failedLoginCount })
        .from(users)
        .where(eq(users.id, userId));
      expect(rows[0]?.failed).toBe(1);
    });

    it('locks the account when the codes are guessed at too often', async () => {
      await enrol();

      for (let attempt = 0; attempt < MAX_FAILED_LOGINS; attempt += 1) {
        const result = await signIn(
          db,
          { email: EMAIL, password: PASSWORD, totpCode: '000000', encryptionKey: KEY },
          NOW,
        );
        expect(result.ok).toBe(false);
      }

      const held = await signIn(db, { email: EMAIL, password: PASSWORD, encryptionKey: KEY }, NOW);
      expect(held.ok).toBe(false);
      if (!held.ok) expect(held.reason).toBe('locked');
    });

    it('says the key is unusable rather than that the code is wrong', async () => {
      const { secret } = await enrol();

      const result = await signIn(
        db,
        { email: EMAIL, password: PASSWORD, totpCode: totpCode(secret, NOW), encryptionKey: OTHER_KEY },
        NOW,
      );
      expect(result).toEqual({ ok: false, reason: 'totp-unavailable' });
    });

    it('does not ask for a code before the password is right', async () => {
      await enrol();

      const result = await signIn(
        db,
        { email: EMAIL, password: 'not the password', totpCode: '000000', encryptionKey: KEY },
        NOW,
      );
      expect(result).toEqual({ ok: false, reason: 'wrong' });
    });
  });
});
