/**
 * Integration tests for the connection service.
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

import { registerAdapter, registerClaim } from '@moneytracker/adapters';
import type {
  DataSourceAdapter,
  NormalizedAccount,
  NormalizedBalance,
  NormalizedTransaction,
} from '@moneytracker/core';

import { ensureDefaultCategories, ensureLocalUser } from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import {
  claimConnection,
  deleteConnection,
  listConnections,
  listLinkedAccounts,
  listProviderAccounts,
  linkConnectionAccounts,
  syncAllConnections,
  syncConnection,
} from '../src/connections.ts';
import { loadDotEnv } from '../src/env.ts';
import { accounts } from '../src/schema.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/** A key for the tests. It is not a secret and never leaves this file. */
const KEY = 'b'.repeat(64);

/** Whether the fake provider should fail. */
let failing = false;

/** A provider that behaves like a live one, without a network. */
class FakeAdapter implements DataSourceAdapter {
  readonly id = 'fake';

  async fetchAccounts(): Promise<NormalizedAccount[]> {
    if (failing) throw new Error('The provider refused the request.');
    return [
      {
        externalId: 'CON-1:1001',
        name: 'Everyday Checking 4417',
        type: 'checking',
        currency: 'USD',
        mask: '4417',
      },
    ];
  }

  async fetchTransactions(accountId: string): Promise<NormalizedTransaction[]> {
    if (failing) throw new Error('The provider refused the request.');
    return [
      {
        externalId: `${accountId}:tx-1`,
        accountId,
        postedAt: new Date('2026-10-05T12:00:00Z'),
        pending: false,
        amountMinor: -4500,
        currency: 'USD',
        descriptionRaw: 'BLUE BOTTLE COFFEE',
      },
      {
        externalId: `${accountId}:tx-2`,
        accountId,
        postedAt: new Date('2026-10-06T12:00:00Z'),
        pending: false,
        amountMinor: 250_000,
        currency: 'USD',
        descriptionRaw: 'PAYROLL',
      },
    ];
  }

  async fetchBalances(): Promise<NormalizedBalance[]> {
    if (failing) throw new Error('The provider refused the request.');
    return [
      {
        accountExternalId: 'CON-1:1001',
        asOf: new Date('2026-10-15T00:00:00Z'),
        balanceMinor: 123_456,
        currency: 'USD',
      },
    ];
  }
}

describe.skipIf(!testDatabaseUrl)('connections', () => {
  let db: Database;
  let userId: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const created = createDatabase(testDatabaseUrl!, { max: 4 });
    db = created.db;
    close = () => created.pool.end();

    await migrate(db, { migrationsFolder });
    registerAdapter('fake', () => new FakeAdapter());
    registerClaim('fake', async (setupToken) => `access-for-${setupToken}`);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    failing = false;
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

  it('connects a provider with a setup token', async () => {
    const connection = await claimConnection(
      db,
      userId,
      { adapterId: 'fake', setupToken: 'setup-token', name: 'My bank' },
      KEY,
    );

    expect(connection).toMatchObject({
      adapterId: 'fake',
      name: 'My bank',
      status: 'active',
    });
    // The credential is not in the connection the app shows.
    expect(JSON.stringify(connection)).not.toContain('setup-token');
  });

  it('lists the accounts behind a connection', async () => {
    const connection = await claimConnection(
      db,
      userId,
      { adapterId: 'fake', setupToken: 'setup-token' },
      KEY,
    );

    const accounts = await listProviderAccounts(db, userId, connection.id, KEY);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      externalId: 'CON-1:1001',
      name: 'Everyday Checking 4417',
      balanceMinor: 123_456,
    });
  });

  it('brings the transactions in and links the account', async () => {
    const connection = await claimConnection(
      db,
      userId,
      { adapterId: 'fake', setupToken: 'setup-token' },
      KEY,
    );

    const result = await syncConnection(db, userId, connection.id, KEY);

    expect(result.transactionsInserted).toBe(2);
    const linked = await listLinkedAccounts(db, userId, connection.id);
    expect(linked).toHaveLength(0);

    // The accounts are linked when the user picks them.
    const accounts = await listProviderAccounts(db, userId, connection.id, KEY);
    await linkConnectionAccounts(
      db,
      userId,
      connection.id,
      accounts.map((account) => account.externalId),
      KEY,
    );

    const after = await listLinkedAccounts(db, userId, connection.id);
    expect(after.map((account) => account.externalId)).toEqual(['CON-1:1001']);
  });

  it('does not import the same data twice', async () => {
    const connection = await claimConnection(
      db,
      userId,
      { adapterId: 'fake', setupToken: 'setup-token' },
      KEY,
    );

    const first = await syncConnection(db, userId, connection.id, KEY);
    const second = await syncConnection(db, userId, connection.id, KEY);

    expect(first.transactionsInserted).toBe(2);
    expect(second.transactionsInserted).toBe(0);
  });

  it('records what went wrong without blocking the other connections', async () => {
    const connection = await claimConnection(
      db,
      userId,
      { adapterId: 'fake', setupToken: 'setup-token' },
      KEY,
    );

    failing = true;
    await expect(syncConnection(db, userId, connection.id, KEY)).rejects.toThrow(/refused/);

    const [after] = await listConnections(db, userId);
    expect(after?.status).toBe('error');
    expect(after?.lastError).toContain('refused');
  });

  it('keeps going when one connection fails', async () => {
    await claimConnection(db, userId, { adapterId: 'fake', setupToken: 'one' }, KEY);
    const second = await claimConnection(db, userId, { adapterId: 'fake', setupToken: 'two' }, KEY);
    expect(second.id).toBeTruthy();

    failing = true;
    const outcome = await syncAllConnections(db, userId, KEY);

    expect(outcome).toEqual({ synced: 0, failed: 2 });
  });

  it('removes a connection and leaves the accounts alone', async () => {
    const connection = await claimConnection(
      db,
      userId,
      { adapterId: 'fake', setupToken: 'setup-token' },
      KEY,
    );
    await syncConnection(db, userId, connection.id, KEY);

    const before = await db.select({ id: accounts.id }).from(accounts);
    expect(before.length).toBeGreaterThan(0);

    expect(await deleteConnection(db, userId, connection.id)).toBe(true);
    expect(await listConnections(db, userId)).toHaveLength(0);

    const after = await db.select({ id: accounts.id }).from(accounts);
    expect(after.length).toBe(before.length);
  });
});
