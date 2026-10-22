/**
 * Integration tests for the connection service and the credential storage.
 *
 * These need a real Postgres. Point TEST_DATABASE_URL at a scratch database
 * and they run; without it they skip, so `pnpm test` still passes on a
 * machine with no database.
 *
 *   TEST_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test pnpm test
 */

import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { ensureDefaultCategories, ensureLocalUser } from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import {
  createConnection,
  deleteConnection,
  linkAccount,
  listConnections,
  readCredential,
  recordSyncResult,
} from '../src/connections.ts';
import { decryptSecret, encryptSecret, isEncryptionKey } from '../src/credentials.ts';
import { loadDotEnv } from '../src/env.ts';
import { accounts, connections } from '../src/schema.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** A key for the tests. It is not a secret and never leaves this file. */
const KEY = 'a'.repeat(64);

describe.skipIf(!testDatabaseUrl)('connections', () => {
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
      sql`truncate table category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, import_profiles, connection_accounts, connections, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;
    await ensureDefaultCategories(db, userId);
  });

  it('encrypts a credential so it is not in the database in clear text', async () => {
    await createConnection(
      db,
      userId,
      { adapterId: 'simplefin', name: 'SoFi checking', credential: 'secret-token' },
      KEY,
    );

    const rows = await db
      .select({ credentialCiphertext: connections.credentialCiphertext })
      .from(connections);
    const stored = rows[0]?.credentialCiphertext ?? '';
    expect(stored).not.toContain('secret-token');
    expect(decryptSecret(stored, KEY)).toBe('secret-token');
  });

  it('reads the credential back for the sync', async () => {
    const created = await createConnection(
      db,
      userId,
      { adapterId: 'simplefin', name: 'SoFi checking', credential: 'secret-token' },
      KEY,
    );

    const token = await readCredential(db, userId, created!.id, KEY);
    expect(token).toBe('secret-token');
  });

  it('never returns the credential when the connections are listed', async () => {
    await createConnection(
      db,
      userId,
      { adapterId: 'simplefin', name: 'SoFi checking', credential: 'secret-token' },
      KEY,
    );

    const [connection] = await listConnections(db, userId);
    expect(JSON.stringify(connection)).not.toContain('secret-token');
    expect(JSON.stringify(connection)).not.toContain('credential');
  });

  it('keeps many connections side by side', async () => {
    await createConnection(
      db,
      userId,
      { adapterId: 'simplefin', name: 'SoFi checking', credential: 'one' },
      KEY,
    );
    await createConnection(
      db,
      userId,
      { adapterId: 'plaid', name: 'Chase savings', credential: 'two' },
      KEY,
    );

    const all = await listConnections(db, userId);
    expect(all.map((connection) => connection.adapterId).sort()).toEqual(['plaid', 'simplefin']);
  });

  it('gives an account to one connection only', async () => {
    const accountRows = await db
      .insert(accounts)
      .values({
        userId,
        adapterId: 'mock',
        externalId: 'account-1',
        name: 'Everyday Checking',
        type: 'checking',
        currency: 'USD',
      })
      .returning({ id: accounts.id });
    const accountId = accountRows[0]?.id ?? '';

    const first = await createConnection(
      db,
      userId,
      { adapterId: 'simplefin', name: 'SoFi checking', credential: 'one' },
      KEY,
    );
    const second = await createConnection(
      db,
      userId,
      { adapterId: 'plaid', name: 'Chase savings', credential: 'two' },
      KEY,
    );

    await linkAccount(db, userId, first!.id, accountId);
    await linkAccount(db, userId, second!.id, accountId);

    const all = await listConnections(db, userId);
    const owners = all.filter((connection) => connection.accountIds.includes(accountId));
    expect(owners).toHaveLength(1);
    expect(owners[0]?.id).toBe(second!.id);
  });

  it('records what went wrong without leaking anything', async () => {
    const created = await createConnection(
      db,
      userId,
      { adapterId: 'simplefin', name: 'SoFi checking', credential: 'secret-token' },
      KEY,
    );

    await recordSyncResult(db, userId, created!.id, { ok: false, error: 'The token was refused' });

    const [connection] = await listConnections(db, userId);
    expect(connection?.status).toBe('error');
    expect(connection?.lastError).toBe('The token was refused');
    expect(connection?.lastSyncedAt).toBeNull();
  });

  it('removes a connection', async () => {
    const created = await createConnection(
      db,
      userId,
      { adapterId: 'simplefin', name: 'SoFi checking', credential: 'one' },
      KEY,
    );

    expect(await deleteConnection(db, userId, created!.id)).toBe(true);
    expect(await listConnections(db, userId)).toHaveLength(0);
  });
});

describe('credential storage', () => {
  it('round trips a secret', () => {
    const stored = encryptSecret('a token', KEY);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(decryptSecret(stored, KEY)).toBe('a token');
  });

  it('uses a new initialization vector every time', () => {
    expect(encryptSecret('a token', KEY)).not.toBe(encryptSecret('a token', KEY));
  });

  it('refuses a key that is not 32 bytes of hex', () => {
    expect(isEncryptionKey('a'.repeat(64))).toBe(true);
    expect(isEncryptionKey('nope')).toBe(false);
    expect(() => encryptSecret('a token', 'nope')).toThrow(/ENCRYPTION_KEY/);
  });

  it('refuses a payload that was changed', () => {
    const stored = encryptSecret('a token', KEY);
    const parts = stored.split(':');
    const tampered = [parts[0], parts[1], parts[2], 'b3RoZXI='].join(':');

    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });
});
