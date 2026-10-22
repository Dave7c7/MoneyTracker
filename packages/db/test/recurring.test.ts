/**
 * Integration tests for the recurring charge service.
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

import { MockAdapter } from '@moneytracker/adapters';

import { ensureDefaultCategories, ensureLocalUser } from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import {
  createManualRecurringItem,
  deleteRecurringItem,
  detectRecurringItems,
  listRecurringItems,
  setRecurringItemStatus,
} from '../src/recurring.ts';
import { syncFromAdapter } from '../src/sync.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!testDatabaseUrl)('recurring charges', () => {
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
      sql`truncate table category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, import_profiles, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;
    await ensureDefaultCategories(db, userId);
  });

  it('finds the subscriptions in the demo data', async () => {
    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });

    const result = await detectRecurringItems(db, userId);

    expect(result.detected).toBeGreaterThan(0);
    const names = result.items.map((item) => item.merchantName);
    expect(names).toContain('Netflix');
    expect(names).toContain('Spotify');
  });

  it('ignores the merchants that only charge once in a while', async () => {
    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });

    const result = await detectRecurringItems(db, userId);

    const names = result.items.map((item) => item.merchantName);
    expect(names).not.toContain('Target');
    expect(names).not.toContain('Whole Foods Market');
  });

  it('flags a price change and keeps the item', async () => {
    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });

    const result = await detectRecurringItems(db, userId);

    const netflix = result.items.find((item) => item.merchantName === 'Netflix');
    expect(netflix?.priceChanged).toBe(true);
    expect(netflix?.previousAmountMinor).toBe(1549);
  });

  it('keeps a dismissed item out of the next run', async () => {
    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });

    const first = await detectRecurringItems(db, userId);
    const netflix = first.items.find((item) => item.merchantName === 'Netflix');
    if (!netflix) throw new Error('Netflix was not detected');

    await setRecurringItemStatus(db, userId, netflix.id, 'dismissed');

    const second = await detectRecurringItems(db, userId);
    expect(second.items.map((item) => item.merchantName)).not.toContain('Netflix');
  });

  it('keeps a confirmed item even when the price moves', async () => {
    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });

    const first = await detectRecurringItems(db, userId);
    const netflix = first.items.find((item) => item.merchantName === 'Netflix');
    if (!netflix) throw new Error('Netflix was not detected');

    await setRecurringItemStatus(db, userId, netflix.id, 'confirmed');
    await detectRecurringItems(db, userId);

    const items = await listRecurringItems(db, userId);
    const confirmed = items.find((item) => item.merchantName === 'Netflix');
    expect(confirmed?.status).toBe('confirmed');
  });

  it('adds a bill by hand', async () => {
    const item = await createManualRecurringItem(db, userId, {
      name: 'Car insurance',
      amountMinor: 120_000,
      currency: 'USD',
      cadence: 'annual',
      nextDate: '2027-03-01',
    });

    expect(item).toMatchObject({
      merchantName: 'Car insurance',
      amountMinor: 120_000,
      cadence: 'annual',
      status: 'confirmed',
      isManual: true,
    });
  });

  it('removes a recurring item', async () => {
    const item = await createManualRecurringItem(db, userId, {
      name: 'Gym',
      amountMinor: 49_000,
      currency: 'USD',
      cadence: 'monthly',
      nextDate: '2026-11-01',
    });

    expect(await deleteRecurringItem(db, userId, item.id)).toBe(true);
    const items = await listRecurringItems(db, userId, { includeDismissed: true });
    expect(items.map((entry) => entry.id)).not.toContain(item.id);
  });
});
