/**
 * Integration tests for signing in.
 *
 * These need a real Postgres. Point TEST_DATABASE_URL at a scratch database
 * and they run; without it they skip, so `pnpm test` still passes on a
 * machine with no database.
 *
 *   TEST_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test pnpm test
 */

import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabase, type Database } from '../src/client.ts';
import { ensureDefaultCategories, ensureLocalUser } from '../src/bootstrap.ts';
import {
  changePassword,
  hashToken,
  hasPassword,
  isExpired,
  listSessions,
  MAX_FAILED_LOGINS,
  resolveSession,
  setPassword,
  signIn,
  signOut,
  signOutEverywhere,
} from '../src/auth.ts';
import { loadDotEnv } from '../src/env.ts';
import { sessions, users } from '../src/schema.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

const PASSWORD = 'correct horse battery staple';
const EMAIL = 'test@example.com';

describe.skipIf(!testDatabaseUrl)('signing in', () => {
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
      sql`truncate table sessions, category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, import_profiles, connection_accounts, connections, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: EMAIL,
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;
    await ensureDefaultCategories(db, userId);
  });

  it('starts with no password at all', async () => {
    expect(await hasPassword(db, userId)).toBe(false);

    // Without a password there is nothing to sign in with.
    const result = await signIn(db, { email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(false);
  });

  it('signs in with the password it was given', async () => {
    await setPassword(db, userId, PASSWORD);

    const result = await signIn(db, { email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await resolveSession(db, result.token)).toBe(userId);
  });

  it('stores only a hash of the cookie, so the token cannot be read back', async () => {
    await setPassword(db, userId, PASSWORD);
    const result = await signIn(db, { email: EMAIL, password: PASSWORD });
    if (!result.ok) throw new Error('expected a session');

    const rows = await db.select({ tokenHash: sessions.tokenHash }).from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashToken(result.token));
    expect(rows[0]?.tokenHash).not.toBe(result.token);
  });

  it('refuses a wrong password, and says the same thing for an unknown email', async () => {
    await setPassword(db, userId, PASSWORD);

    const wrong = await signIn(db, { email: EMAIL, password: 'wrong password entirely' });
    expect(wrong).toEqual({ ok: false, reason: 'wrong' });

    const unknown = await signIn(db, { email: 'nobody@example.com', password: PASSWORD });
    expect(unknown).toEqual({ ok: false, reason: 'wrong' });
  });

  it('pauses sign-in after too many wrong passwords', async () => {
    await setPassword(db, userId, PASSWORD);

    for (let attempt = 0; attempt < MAX_FAILED_LOGINS; attempt += 1) {
      const result = await signIn(db, { email: EMAIL, password: 'still wrong' });
      expect(result.ok).toBe(false);
    }

    // Even the right password is refused while the hold lasts.
    const held = await signIn(db, { email: EMAIL, password: PASSWORD });
    expect(held.ok).toBe(false);
    if (!held.ok) expect(held.reason).toBe('locked');

    // When the hold is over, the right password works again.
    const later = new Date(Date.now() + 16 * 60 * 1000);
    const result = await signIn(db, { email: EMAIL, password: PASSWORD }, later);
    expect(result.ok).toBe(true);
  });

  it('forgets the failed attempts once signing in works', async () => {
    await setPassword(db, userId, PASSWORD);

    await signIn(db, { email: EMAIL, password: 'wrong' });
    await signIn(db, { email: EMAIL, password: 'wrong' });
    await signIn(db, { email: EMAIL, password: PASSWORD });

    const [row] = await db
      .select({ failed: users.failedLoginCount })
      .from(users)
      .where(eq(users.id, userId));
    expect(row?.failed).toBe(0);
  });

  it('is gone when it is signed out', async () => {
    await setPassword(db, userId, PASSWORD);
    const result = await signIn(db, { email: EMAIL, password: PASSWORD });
    if (!result.ok) throw new Error('expected a session');

    await signOut(db, result.token);
    expect(await resolveSession(db, result.token)).toBeNull();
  });

  it('treats an expired session as signed out, and clears it away', async () => {
    await setPassword(db, userId, PASSWORD);
    const result = await signIn(db, { email: EMAIL, password: PASSWORD });
    if (!result.ok) throw new Error('expected a session');

    const later = new Date(result.expiresAt.getTime() + 1000);
    expect(await resolveSession(db, result.token, later)).toBeNull();

    const rows = await db.select({ id: sessions.id }).from(sessions);
    expect(rows).toHaveLength(0);
  });

  it('ignores a made up token', async () => {
    expect(await resolveSession(db, 'not-a-real-token')).toBeNull();
    expect(await resolveSession(db, '')).toBeNull();
  });

  it('changes the password only for someone who knows the current one', async () => {
    await setPassword(db, userId, PASSWORD);
    const first = await signIn(db, { email: EMAIL, password: PASSWORD });
    if (!first.ok) throw new Error('expected a session');

    const refused = await changePassword(db, userId, first.token, 'not it', 'a brand new password');
    expect(refused.ok).toBe(false);

    const changed = await changePassword(db, userId, first.token, PASSWORD, 'a brand new password');
    expect(changed.ok).toBe(true);

    // The session that made the change is kept; every other one is gone.
    expect(await resolveSession(db, first.token)).toBe(userId);
    expect(await listSessions(db, userId)).toHaveLength(1);

    // The old password stops working and the new one starts.
    expect((await signIn(db, { email: EMAIL, password: PASSWORD })).ok).toBe(false);
    expect((await signIn(db, { email: EMAIL, password: 'a brand new password' })).ok).toBe(true);
  });

  it('ends every other session when asked', async () => {
    await setPassword(db, userId, PASSWORD);
    const phone = await signIn(db, { email: EMAIL, password: PASSWORD });
    const laptop = await signIn(db, { email: EMAIL, password: PASSWORD });
    if (!phone.ok || !laptop.ok) throw new Error('expected two sessions');

    await signOutEverywhere(db, userId, phone.token);
    expect(await resolveSession(db, phone.token)).toBe(userId);
    expect(await resolveSession(db, laptop.token)).toBeNull();
  });

  it('refuses a password that is too short', async () => {
    await expect(setPassword(db, userId, 'short')).rejects.toThrow(/at least/);
    expect(await hasPassword(db, userId)).toBe(false);
  });

  it('knows when a session has run out', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(isExpired(new Date('2026-01-01T00:00:01Z'), now)).toBe(false);
    expect(isExpired(now, now)).toBe(true);
    expect(isExpired(new Date('2025-12-31T23:59:59Z'), now)).toBe(true);
  });
});
