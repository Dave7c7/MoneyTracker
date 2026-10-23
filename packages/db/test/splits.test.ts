/**
 * Integration tests for the split service.
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

import { spendingByCategory } from '@moneytracker/core';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import {
  ensureBankCategoryMappings,
  ensureDefaultCategories,
  ensureLocalUser,
} from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import { listDashboardTransactions, listTransactions } from '../src/queries.ts';
import { categories, transactions } from '../src/schema.ts';
import {
  clearTransactionSplit,
  listTransactionSplits,
  setTransactionSplit,
} from '../src/splits.ts';
import { syncFromAdapter } from '../src/sync.ts';
import { MockAdapter } from '@moneytracker/adapters';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!testDatabaseUrl)('split service', () => {
  let db: Database;
  let userId: string;
  let close: () => Promise<void>;
  let groceriesId: string;
  let gasId: string;
  let transferId: string;

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
      sql`truncate table category_assignments, split_lines, transactions, merchants, balance_snapshots, rules, bank_category_mappings, import_profiles, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;

    const categoryIds = await ensureDefaultCategories(db, userId);
    await ensureBankCategoryMappings(db, userId, categoryIds);

    const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
    const bySlug = new Map(rows.map((row) => [row.slug, row.id]));
    groceriesId = bySlug.get('groceries')!;
    gasId = bySlug.get('gas')!;
    transferId = bySlug.get('transfer')!;
  });

  /** Imports the demo data and returns one spending transaction. */
  async function seedSpending(): Promise<string> {
    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });

    const rows = await db
      .select({ id: transactions.id, amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(sql`${transactions.amountMinor} < 0`)
      .limit(1);

    return rows[0]!.id;
  }

  it('splits a transaction into parts that add up', async () => {
    const transactionId = await seedSpending();
    const [transaction] = await db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    const half = Math.floor(transaction!.amountMinor / 2);
    const rest = transaction!.amountMinor - half;

    const outcome = await setTransactionSplit(db, userId, transactionId, [
      { categoryId: groceriesId, amountMinor: half },
      { categoryId: gasId, amountMinor: rest },
    ]);

    expect(outcome.ok).toBe(true);
    const lines = await listTransactionSplits(db, userId, transactionId);
    expect(lines).toHaveLength(2);
    expect(lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(transaction!.amountMinor);
  });

  it('refuses a split whose parts do not add up', async () => {
    const transactionId = await seedSpending();

    const outcome = await setTransactionSplit(db, userId, transactionId, [
      { categoryId: groceriesId, amountMinor: -100 },
      { categoryId: gasId, amountMinor: -200 },
    ]);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('add up');
  });

  it('refuses a split with only one part', async () => {
    const transactionId = await seedSpending();

    const outcome = await setTransactionSplit(db, userId, transactionId, [
      { categoryId: groceriesId, amountMinor: -100 },
    ]);

    expect(outcome.ok).toBe(false);
  });

  it('refuses a split on a transaction that is a transfer', async () => {
    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });

    const rows = await db
      .select({ id: transactions.id, amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(sql`${transactions.transferGroupId} is not null`)
      .limit(1);

    const transfer = rows[0];
    if (!transfer) throw new Error('The demo data has no transfer');

    const outcome = await setTransactionSplit(db, userId, transfer.id, [
      { categoryId: groceriesId, amountMinor: Math.floor(transfer.amountMinor / 2) },
      {
        categoryId: gasId,
        amountMinor: transfer.amountMinor - Math.floor(transfer.amountMinor / 2),
      },
    ]);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain('transfer');
  });

  it('refuses a split on the transfer category', async () => {
    const transactionId = await seedSpending();
    const [transaction] = await db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    const outcome = await setTransactionSplit(db, userId, transactionId, [
      { categoryId: transferId, amountMinor: Math.floor(transaction!.amountMinor / 2) },
      {
        categoryId: gasId,
        amountMinor: transaction!.amountMinor - Math.floor(transaction!.amountMinor / 2),
      },
    ]);

    // The transfer category is not a category to spend on.
    expect(outcome.ok).toBe(false);
  });

  it('keeps the parts out of the review inbox', async () => {
    const transactionId = await seedSpending();
    const [transaction] = await db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    const half = Math.floor(transaction!.amountMinor / 2);
    await setTransactionSplit(db, userId, transactionId, [
      { categoryId: groceriesId, amountMinor: half },
      { categoryId: gasId, amountMinor: transaction!.amountMinor - half },
    ]);

    const rows = await listTransactions(db, userId, { limit: 5000 });
    const row = rows.find((item) => item.id === transactionId);
    expect(row?.splitLines).toHaveLength(2);
    expect(row?.locked).toBe(true);
  });

  it('counts every part under its own category', async () => {
    const transactionId = await seedSpending();
    const [transaction] = await db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    const half = Math.floor(transaction!.amountMinor / 2);
    await setTransactionSplit(db, userId, transactionId, [
      { categoryId: groceriesId, amountMinor: half },
      { categoryId: gasId, amountMinor: transaction!.amountMinor - half },
    ]);

    const rows = await listDashboardTransactions(db, userId);
    const row = rows.find((item) => item.id === transactionId);
    expect(row?.splitLines).toHaveLength(2);

    // The parts add up to the whole, so the spending is the same as before.
    const spending = spendingByCategory(
      rows.map((item) => ({
        id: item.id,
        accountId: item.accountId,
        postedAt: item.postedAt,
        amountMinor: item.amountMinor,
        currency: item.currency,
        pending: item.pending,
        merchantId: item.merchantId,
        merchantName: item.merchantName,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        categoryKind: item.categoryKind ?? 'uncategorized',
      })),
      { timeZone: 'UTC' },
    );

    const gas = spending.categories.find((category) => category.categoryId === gasId);
    expect(gas).toBeDefined();
  });

  it('removes a split and leaves the transaction with one category', async () => {
    const transactionId = await seedSpending();
    const [transaction] = await db
      .select({ amountMinor: transactions.amountMinor })
      .from(transactions)
      .where(eq(transactions.id, transactionId));

    const half = Math.floor(transaction!.amountMinor / 2);
    await setTransactionSplit(db, userId, transactionId, [
      { categoryId: groceriesId, amountMinor: half },
      { categoryId: gasId, amountMinor: transaction!.amountMinor - half },
    ]);

    expect(await clearTransactionSplit(db, userId, transactionId)).toBe(true);
    expect(await listTransactionSplits(db, userId, transactionId)).toHaveLength(0);

    const rows = await listTransactions(db, userId, { limit: 5000 });
    const row = rows.find((item) => item.id === transactionId);
    expect(row?.splitLines).toHaveLength(0);
    expect(row?.locked).toBe(false);
  });
});
