/**
 * Integration tests for the transfers service.
 *
 * These need a real Postgres:
 *
 *   TEST_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test pnpm test
 */

import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MockAdapter } from '@moneytracker/adapters';
import { spendingInMonth, type DashboardTransaction } from '@moneytracker/core';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { listReviewTransactions, setManualCategory } from '../src/assignments.ts';
import {
  ensureBankCategoryMappings,
  ensureDefaultCategories,
  ensureLocalUser,
} from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import { listDashboardTransactions } from '../src/queries.ts';
import {
  categories,
  categoryAssignments,
  transactions as transactionsTable,
  transferGroups,
} from '../src/schema.ts';
import {
  detectAndApplyTransfers,
  listTransferGroups,
  markAsTransfer,
  unmarkTransfer,
} from '../src/transfers.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!testDatabaseUrl)('transfers', () => {
  let db: Database;
  let userId: string;
  let close: () => Promise<void>;
  let transferCategoryId: string;
  let categoryIds: Map<string, string>;

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
      sql`truncate table category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, categories, accounts, users, transfer_groups restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;

    categoryIds = await ensureDefaultCategories(db, userId);
    await ensureBankCategoryMappings(db, userId, categoryIds);
    transferCategoryId = categoryIds.get('transfer')!;
  });

  /** Imports the demo data, which includes a transfer and a card payment. */
  async function seedDemoData() {
    const { syncFromAdapter } = await import('../src/sync.ts');
    return syncFromAdapter({ db, adapter: new MockAdapter(), userId });
  }

  async function transactionsOf(description: string) {
    const rows = await db
      .select({
        id: transactionsTable.id,
        amountMinor: transactionsTable.amountMinor,
        postedDate: transactionsTable.postedDate,
        transferGroupId: transactionsTable.transferGroupId,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.descriptionRaw, description))
      .orderBy(transactionsTable.postedDate);

    return rows;
  }

  async function categoryOf(transactionId: string) {
    const rows = await db
      .select({
        categoryId: categoryAssignments.categoryId,
        source: categoryAssignments.source,
        confidence: categoryAssignments.confidence,
        locked: categoryAssignments.locked,
      })
      .from(categoryAssignments)
      .where(eq(categoryAssignments.transactionId, transactionId));

    return rows[0] ?? null;
  }

  /**
   * Adds a payment that has no partner on another account.
   */
  async function insertLonelyTransfer() {
    const account = await db
      .select({ accountId: transactionsTable.accountId })
      .from(transactionsTable)
      .where(eq(transactionsTable.descriptionRaw, 'ONLINE TRANSFER TO SAVINGS 8820'))
      .limit(1);

    await db.insert(transactionsTable).values({
      userId,
      accountId: account[0]!.accountId,
      externalId: 'lonely-transfer',
      postedAt: new Date('2026-10-01T12:00:00Z'),
      postedDate: '2026-10-01',
      pending: false,
      amountMinor: -12_345,
      currency: 'USD',
      descriptionRaw: 'ONLINE TRANSFER TO ANOTHER BANK 9911',
      sourceAdapter: 'mock',
    });
  }

  /** The spending of October 2026, the way the dashboards see it. */
  async function spendingInOctober() {
    const rows = await listDashboardTransactions(db, userId);
    const dashboardRows: DashboardTransaction[] = rows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      postedAt: row.postedAt,
      amountMinor: row.amountMinor,
      currency: row.currency,
      pending: row.pending,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryKind: row.categoryKind ?? 'uncategorized',
    }));

    return spendingInMonth(dashboardRows, '2026-10', 'UTC');
  }

  it('links the two sides of a transfer and keeps them out of spending', async () => {
    const result = await seedDemoData();
    expect(result.transferGroupsCreated).toBeGreaterThan(0);

    const [outgoing] = await transactionsOf('ONLINE TRANSFER TO SAVINGS 8820');
    const [incoming] = await transactionsOf('ONLINE TRANSFER FROM CHECKING 4417');

    expect(outgoing?.transferGroupId).toBeTruthy();
    expect(incoming?.transferGroupId).toBe(outgoing?.transferGroupId);
    // The two sides are a day apart, in the same month.
    expect(outgoing?.postedDate?.slice(0, 7)).toBe(incoming?.postedDate?.slice(0, 7));

    const assignment = await categoryOf(outgoing!.id);
    expect(assignment?.categoryId).toBe(transferCategoryId);
    expect(assignment?.source).toBe('transfer_detection');
  });

  it('treats a credit card payment as a transfer', async () => {
    await seedDemoData();

    const payment = await transactionsOf('PAYMENT RECEIVED - THANK YOU');
    expect(payment.length).toBeGreaterThan(0);

    const groups = await listTransferGroups(db, userId);
    const cardPayment = groups.find((group) => group.kind === 'card_payment');
    expect(cardPayment).toBeTruthy();
    expect(cardPayment?.memberCount).toBe(2);
  });

  it('leaves ordinary spending alone', async () => {
    await seedDemoData();

    const [coffee] = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(sql`${transactionsTable.descriptionRaw} ilike '%BLUE BOTTLE%'`)
      .limit(1);

    const assignment = await categoryOf(coffee!.id);
    expect(assignment?.categoryId).not.toBe(transferCategoryId);
  });

  it('marks a transaction as a transfer by hand and locks it', async () => {
    await seedDemoData();

    const [coffee] = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(sql`${transactionsTable.descriptionRaw} ilike '%BLUE BOTTLE%'`)
      .limit(1);

    const marked = await markAsTransfer(db, userId, coffee!.id);
    expect(marked).toBe(true);

    const assignment = await categoryOf(coffee!.id);
    expect(assignment?.categoryId).toBe(transferCategoryId);
    expect(assignment?.source).toBe('user_manual');
    expect(assignment?.locked).toBe(true);

    const rows = await db
      .select({ transferGroupId: transactionsTable.transferGroupId })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, coffee!.id));
    expect(rows[0]?.transferGroupId).toBeTruthy();
  });

  it('takes a transfer back and categorizes the transaction again', async () => {
    await seedDemoData();

    const [coffee] = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(sql`${transactionsTable.descriptionRaw} ilike '%BLUE BOTTLE%'`)
      .limit(1);

    await markAsTransfer(db, userId, coffee!.id);
    const unmarked = await unmarkTransfer(db, userId, coffee!.id);
    expect(unmarked).toBe(true);

    const rows = await db
      .select({ transferGroupId: transactionsTable.transferGroupId })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, coffee!.id));
    expect(rows[0]?.transferGroupId).toBeNull();

    const assignment = await categoryOf(coffee!.id);
    expect(assignment?.categoryId).not.toBe(transferCategoryId);
  });

  it('sends a transfer without a partner to the review inbox', async () => {
    await seedDemoData();

    await insertLonelyTransfer();

    const result = await detectAndApplyTransfers(db, userId);
    expect(result.suspected).toBe(1);

    const review = await listReviewTransactions(db, userId);
    const suspected = review.find(
      (item) => item.descriptionRaw === 'ONLINE TRANSFER TO ANOTHER BANK 9911',
    );
    expect(suspected).toBeTruthy();
    expect(suspected?.categoryKind).toBe('transfer');
  });

  it('keeps a suspected transfer out of the spending totals', async () => {
    await seedDemoData();

    const before = await spendingInOctober();

    await insertLonelyTransfer();
    await detectAndApplyTransfers(db, userId);

    const after = await spendingInOctober();

    // The transfer is out of the totals, so the total did not move.
    expect(after).toBe(before);
  });

  it('does not touch a transaction the user decided by hand', async () => {
    await seedDemoData();

    const [outgoing] = await transactionsOf('ONLINE TRANSFER TO SAVINGS 8820');
    await db
      .update(categoryAssignments)
      .set({ locked: true, categoryId: transferCategoryId, confidence: 1 })
      .where(eq(categoryAssignments.transactionId, outgoing!.id));

    const before = await db
      .select({ reason: categoryAssignments.reason })
      .from(categoryAssignments)
      .where(eq(categoryAssignments.transactionId, outgoing!.id));

    await detectAndApplyTransfers(db, userId);

    const after = await db
      .select({ reason: categoryAssignments.reason })
      .from(categoryAssignments)
      .where(eq(categoryAssignments.transactionId, outgoing!.id));

    expect(after[0]?.reason).toBe(before[0]?.reason);
  });

  it('keeps a transaction in its group when the transfer category is chosen', async () => {
    await seedDemoData();

    const [coffee] = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(sql`${transactionsTable.descriptionRaw} ilike '%BLUE BOTTLE%'`)
      .limit(1);

    await setManualCategory(db, userId, coffee!.id, transferCategoryId);

    const rows = await db
      .select({ transferGroupId: transactionsTable.transferGroupId })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, coffee!.id));
    expect(rows[0]?.transferGroupId).toBeTruthy();

    const assignment = await categoryOf(coffee!.id);
    expect(assignment?.categoryId).toBe(transferCategoryId);
    expect(assignment?.locked).toBe(true);
  });

  it('takes a transaction out of its group when another category is chosen', async () => {
    await seedDemoData();

    const [outgoing] = await transactionsOf('ONLINE TRANSFER TO SAVINGS 8820');
    expect(outgoing?.transferGroupId).toBeTruthy();

    await setManualCategory(db, userId, outgoing!.id, categoryIds.get('groceries')!);

    const rows = await db
      .select({ transferGroupId: transactionsTable.transferGroupId })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, outgoing!.id));
    expect(rows[0]?.transferGroupId).toBeNull();
  });

  it('leaves no group without members', async () => {
    await seedDemoData();

    const groups = await listTransferGroups(db, userId);
    expect(groups.length).toBeGreaterThan(0);

    const rows = await db
      .select({ groupId: transactionsTable.transferGroupId })
      .from(transactionsTable)
      .where(sql`${transactionsTable.transferGroupId} is not null`);

    const used = new Set(rows.map((row) => row.groupId));
    for (const group of groups) {
      expect(used.has(group.id)).toBe(true);
    }

    const orphan = await db
      .select({ id: transferGroups.id })
      .from(transferGroups)
      .leftJoin(transactionsTable, eq(transactionsTable.transferGroupId, transferGroups.id))
      .where(sql`${transactionsTable.id} is null`);

    expect(orphan).toHaveLength(0);
  });

  it('keeps the transfer category out of the default categories', async () => {
    const rows = await db
      .select({ kind: categories.kind })
      .from(categories)
      .where(eq(categories.userId, userId));

    expect(rows.filter((row) => row.kind === 'transfer')).toHaveLength(1);
  });
});
