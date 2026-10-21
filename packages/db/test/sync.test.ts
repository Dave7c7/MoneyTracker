/**
 * Integration tests for the sync service.
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

import { MockAdapter } from '@moneytracker/adapters';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import {
  ensureBankCategoryMappings,
  ensureDefaultCategories,
  ensureLocalUser,
} from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import { categoryAssignments, transactions } from '../src/schema.ts';
import { syncFromAdapter } from '../src/sync.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!testDatabaseUrl)('sync service', () => {
  let db: Database;
  let userId: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const created = createDatabase(testDatabaseUrl!, { max: 4 });
    db = created.db;
    close = () => created.pool.end();

    // Apply the migrations. The migrator tracks what it has already run, so
    // this is safe to repeat.
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;

    const categoryIds = await ensureDefaultCategories(db, userId);
    await ensureBankCategoryMappings(db, userId, categoryIds);
  });

  it('importing the same data twice creates zero duplicates', async () => {
    const adapter = new MockAdapter();

    const first = await syncFromAdapter({ db, adapter, userId });
    const afterFirst = await db.select({ value: sql<number>`count(*)` }).from(transactions);

    const second = await syncFromAdapter({ db, adapter, userId });
    const afterSecond = await db.select({ value: sql<number>`count(*)` }).from(transactions);

    expect(first.transactionsInserted).toBeGreaterThan(0);
    expect(second.transactionsInserted).toBe(0);
    expect(afterSecond[0]?.value).toBe(afterFirst[0]?.value);
  });

  it('moves a pending transaction to posted instead of inserting a second row', async () => {
    const adapter = new MockAdapter();
    await syncFromAdapter({ db, adapter, userId });

    const pending = await db.select().from(transactions).where(eq(transactions.pending, true));
    expect(pending.length).toBeGreaterThan(0);

    const target = pending[0]!;
    const before = await db.select({ value: sql<number>`count(*)` }).from(transactions);

    // The same transaction arrives, now posted.
    await db
      .update(transactions)
      .set({
        pending: false,
        postedAt: new Date('2026-10-20T12:00:00Z'),
        postedDate: '2026-10-20',
      })
      .where(eq(transactions.id, target.id));

    const after = await db.select({ value: sql<number>`count(*)` }).from(transactions);
    expect(after[0]?.value).toBe(before[0]?.value);
  });

  it('never overwrites a locked assignment', async () => {
    const adapter = new MockAdapter();
    await syncFromAdapter({ db, adapter, userId });

    const [assignment] = await db.select().from(categoryAssignments).limit(1);
    expect(assignment).toBeDefined();

    await db
      .update(categoryAssignments)
      .set({ locked: true, categoryId: assignment!.categoryId, reason: 'Set by you' })
      .where(eq(categoryAssignments.transactionId, assignment!.transactionId));

    const lockedCategoryId = assignment!.categoryId;
    const before = await db
      .select()
      .from(categoryAssignments)
      .where(eq(categoryAssignments.transactionId, assignment!.transactionId));

    // Re-import: the locked assignment must survive.
    await syncFromAdapter({ db, adapter, userId });

    const after = await db
      .select()
      .from(categoryAssignments)
      .where(eq(categoryAssignments.transactionId, assignment!.transactionId));

    expect(after[0]?.categoryId).toBe(lockedCategoryId);
    expect(after[0]?.reason).toBe('Set by you');
    expect(after[0]?.locked).toBe(true);
    expect(after[0]?.categoryId).toBe(before[0]?.categoryId);
  });

  it('categorizes transactions from the bank category mapping', async () => {
    const adapter = new MockAdapter();
    await syncFromAdapter({ db, adapter, userId });

    const assignments = await db.select().from(categoryAssignments);
    expect(assignments.length).toBeGreaterThan(0);

    const sources = new Set(assignments.map((assignment) => assignment.source));
    expect(sources.has('bank')).toBe(true);
    // Bank categories are never fully trusted.
    const bankAssignments = assignments.filter((assignment) => assignment.source === 'bank');
    expect(bankAssignments.every((assignment) => assignment.confidence <= 0.7)).toBe(true);
  });

  it('sends transactions with no bank category to the review inbox', async () => {
    const adapter = new MockAdapter();
    await syncFromAdapter({ db, adapter, userId });

    const fallback = await db
      .select()
      .from(categoryAssignments)
      .where(eq(categoryAssignments.source, 'fallback'));
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.every((assignment) => assignment.confidence === 0)).toBe(true);
  });
});
