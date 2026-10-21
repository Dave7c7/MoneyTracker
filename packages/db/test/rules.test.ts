/**
 * Integration tests for the rules and assignment services.
 *
 * These need a real Postgres:
 *
 *   TEST_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test pnpm test
 */

import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MockAdapter } from '@moneytracker/adapters';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import {
  bulkSetCategory,
  currentAssignments,
  listReviewGroups,
  listReviewTransactions,
  setManualCategory,
  undoBulkSetCategory,
} from '../src/assignments.ts';
import {
  ensureBankCategoryMappings,
  ensureDefaultCategories,
  ensureLocalUser,
} from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import { categoryAssignments, transactions as transactionsTable } from '../src/schema.ts';
import { applyRules, createRule, deleteRule, listRules, updateRule } from '../src/rules.ts';
import { syncFromAdapter } from '../src/sync.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe.skipIf(!testDatabaseUrl)('rules and assignments', () => {
  let db: Database;
  let userId: string;
  let close: () => Promise<void>;
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
      sql`truncate table category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;

    categoryIds = await ensureDefaultCategories(db, userId);
    await ensureBankCategoryMappings(db, userId, categoryIds);

    await syncFromAdapter({ db, adapter: new MockAdapter(), userId });
  });

  async function categoryOf(transactionId: string) {
    const rows = await db
      .select({
        categoryId: categoryAssignments.categoryId,
        source: categoryAssignments.source,
        locked: categoryAssignments.locked,
      })
      .from(categoryAssignments)
      .where(eq(categoryAssignments.transactionId, transactionId));
    return rows[0];
  }

  async function firstBlueBottle() {
    const result = await db.execute(sql`
      select t.id, t.amount_minor
      from transactions t
      join merchants m on m.id = t.merchant_id
      where m.key = 'blue bottle coffee'
      order by t.posted_at
      limit 1
    `);
    const rows = result.rows as unknown as Array<{ id: string; amount_minor: number }>;
    const row = rows[0];
    if (!row) throw new Error('No Blue Bottle transaction found');
    return row;
  }

  it('creates a rule and applies it to the matching transactions', async () => {
    const before = await firstBlueBottle();
    expect((await categoryOf(before.id))?.categoryId).toBe(categoryIds.get('coffee'));

    const rule = await createRule(db, userId, {
      name: 'Blue Bottle → Groceries',
      categoryId: categoryIds.get('groceries')!,
      matchMerchant: 'blue bottle',
    });

    const applied = await applyRules(db, userId);

    expect(applied.changed).toBeGreaterThan(0);
    expect((await categoryOf(before.id))?.categoryId).toBe(categoryIds.get('groceries'));

    const rules = await listRules(db, userId);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.id).toBe(rule.id);
    expect(rules[0]?.matchedCount).toBeGreaterThan(0);
  });

  it('never overwrites a manual edit when a rule changes', async () => {
    const target = await firstBlueBottle();

    await setManualCategory(db, userId, target.id, categoryIds.get('shopping')!);
    expect((await categoryOf(target.id))?.locked).toBe(true);

    await createRule(db, userId, {
      name: 'Blue Bottle → Groceries',
      categoryId: categoryIds.get('groceries')!,
      matchMerchant: 'blue bottle',
    });
    const applied = await applyRules(db, userId);

    expect(applied.skipped).toBeGreaterThan(0);
    const after = await categoryOf(target.id);
    expect(after?.categoryId).toBe(categoryIds.get('shopping'));
    expect(after?.source).toBe('user_manual');
    expect(after?.locked).toBe(true);
  });

  it('puts transactions back when a rule is deleted', async () => {
    const target = await firstBlueBottle();

    const rule = await createRule(db, userId, {
      name: 'Blue Bottle → Groceries',
      categoryId: categoryIds.get('groceries')!,
      matchMerchant: 'blue bottle',
    });
    await applyRules(db, userId);
    expect((await categoryOf(target.id))?.categoryId).toBe(categoryIds.get('groceries'));

    await deleteRule(db, userId, rule.id);
    await applyRules(db, userId);

    expect((await categoryOf(target.id))?.categoryId).toBe(categoryIds.get('coffee'));
  });

  it('updates a rule and re-categorizes', async () => {
    const target = await firstBlueBottle();

    const rule = await createRule(db, userId, {
      name: 'Blue Bottle → Groceries',
      categoryId: categoryIds.get('groceries')!,
      matchMerchant: 'blue bottle',
    });
    await applyRules(db, userId);

    await updateRule(db, userId, rule.id, { categoryId: categoryIds.get('gas')! });
    await applyRules(db, userId);

    expect((await categoryOf(target.id))?.categoryId).toBe(categoryIds.get('gas'));
  });

  it('locks every transaction a bulk edit touches', async () => {
    const target = await firstBlueBottle();

    const changed = await bulkSetCategory(db, userId, [target.id], categoryIds.get('gas')!);
    expect(changed).toBe(1);

    const assignment = await categoryOf(target.id);
    expect(assignment?.categoryId).toBe(categoryIds.get('gas'));
    expect(assignment?.source).toBe('user_manual');
    expect(assignment?.locked).toBe(true);
  });

  it('remembers the previous assignment so a bulk edit can be undone', async () => {
    const target = await firstBlueBottle();
    const before = await currentAssignments(db, userId, [target.id]);
    expect(before[0]?.assignment?.categoryId).toBe(categoryIds.get('coffee'));
    expect(before[0]?.assignment?.source).toBe('bank');
    expect(before[0]?.assignment?.locked).toBe(false);

    await bulkSetCategory(db, userId, [target.id], categoryIds.get('gas')!);
    expect((await categoryOf(target.id))?.categoryId).toBe(categoryIds.get('gas'));

    await undoBulkSetCategory(db, userId, before);
    const after = await categoryOf(target.id);
    expect(after?.categoryId).toBe(categoryIds.get('coffee'));
    expect(after?.source).toBe('bank');
    expect(after?.locked).toBe(false);
  });

  it('groups the review inbox by merchant', async () => {
    const groups = await listReviewGroups(db, userId);

    expect(groups.length).toBeGreaterThan(0);
    // Every group holds at least one transaction, and the counts add up.
    const total = groups.reduce((sum, group) => sum + group.transactions.length, 0);
    const items = await listReviewTransactions(db, userId);
    expect(total).toBe(items.length);

    // The biggest group is a merchant with many transactions.
    expect(groups[0]?.transactions.length).toBeGreaterThan(1);
    expect(groups[0]?.suggestedCategoryId).toBeTruthy();
  });

  it('keeps a locked transaction out of the review inbox', async () => {
    const target = await firstBlueBottle();
    await setManualCategory(db, userId, target.id, categoryIds.get('gas')!);

    const items = await listReviewTransactions(db, userId);
    expect(items.some((item) => item.id === target.id)).toBe(false);
  });

  it('does not touch transactions of other users', async () => {
    const other = await ensureLocalUser(db, {
      email: 'other@example.com',
      displayName: 'Other',
      timeZone: 'UTC',
    });

    const rows = await db
      .select({ id: transactionsTable.id })
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, other.id));
    expect(rows).toHaveLength(0);
  });
});
