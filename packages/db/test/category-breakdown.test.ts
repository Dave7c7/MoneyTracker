/**
 * Integration tests for the category breakdown query.
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

import {
  ensureBankCategoryMappings,
  ensureDefaultCategories,
  ensureLocalUser,
} from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import { getCategorySpendByMonth } from '../src/queries.ts';
import { categories } from '../src/schema.ts';
import { syncFromAdapter } from '../src/sync.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * The demo data of October 2026, read by hand from the seeded transactions.
 *
 *   rent          2250.00   housing
 *   utilities      107.38   housing
 *   groceries      834.81   food
 *   restaurants    871.05   food
 *   coffee          39.92   food
 *   gas            230.44   transport
 *   internet        69.99   bills
 *   phone           45.00   bills
 *   subscriptions   46.96   entertainment
 *   health          49.00   health
 *   shopping       731.25   shopping
 *
 * Together: 5275.80, which is the spending the overview shows for that month.
 */
const OCTOBER_2026 = '2026-10';

describe.skipIf(!testDatabaseUrl)('the category breakdown query', () => {
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
    const categoryIds = await ensureDefaultCategories(db, userId);
    await ensureBankCategoryMappings(db, userId, categoryIds);
    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });
  });

  it('adds up to the spending of the month', async () => {
    const rows = await getCategorySpendByMonth(db, userId, { month: OCTOBER_2026 });

    const total = rows.reduce((sum, row) => sum - row.amountMinor, 0);
    expect(total).toBe(527_580);
  });

  it('puts every category in its group', async () => {
    const rows = await getCategorySpendByMonth(db, userId, { month: OCTOBER_2026 });
    const rent = rows.find((row) => row.categoryName === 'Rent');

    expect(rent).toBeDefined();
    expect(rent?.groupName).toBe('Housing');
    expect(rent?.groupId).not.toBe(rent?.categoryId);
    expect(rent?.amountMinor).toBe(-225_000);
  });

  it('leaves transfers and income out', async () => {
    const rows = await getCategorySpendByMonth(db, userId, { month: OCTOBER_2026 });

    const slugs = await db
      .select({ id: categories.id, slug: categories.slug, kind: categories.kind })
      .from(categories);
    const spendingKinds = new Set(['spending', 'uncategorized']);

    for (const row of rows) {
      const category = slugs.find((entry) => entry.id === row.categoryId);
      expect(spendingKinds.has(category?.kind ?? '')).toBe(true);
    }
    expect(rows.some((row) => row.categoryName === 'Transfer')).toBe(false);
    expect(rows.some((row) => row.categoryName === 'Salary')).toBe(false);
  });

  it('only gives the rows of the month', async () => {
    const october = await getCategorySpendByMonth(db, userId, { month: OCTOBER_2026 });
    const september = await getCategorySpendByMonth(db, userId, { month: '2026-09' });

    expect(september.length).toBeGreaterThan(0);
    expect(september).not.toEqual(october);

    const octoberTotal = october.reduce((sum, row) => sum - row.amountMinor, 0);
    const septemberTotal = september.reduce((sum, row) => sum - row.amountMinor, 0);
    expect(octoberTotal).not.toBe(septemberTotal);
  });

  it('gives nothing to another user', async () => {
    const other = await ensureLocalUser(db, {
      email: 'other@example.com',
      displayName: 'Other',
      timeZone: 'UTC',
    });

    const rows = await getCategorySpendByMonth(db, other.id, { month: OCTOBER_2026 });

    expect(rows).toEqual([]);
  });

  it('has nothing to show for a month without spending', async () => {
    const rows = await getCategorySpendByMonth(db, userId, { month: '2020-01' });

    expect(rows).toEqual([]);
  });
});
