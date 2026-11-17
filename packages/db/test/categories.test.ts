/**
 * Integration tests for custom categories and keyword suggestions.
 *
 * These need a real Postgres; `pnpm test` sets the scratch database up.
 */

import { and, eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { listReviewGroups, setManualCategory } from '../src/assignments.ts';
import {
  ensureBankCategoryMappings,
  ensureDefaultCategories,
  ensureLocalUser,
} from '../src/bootstrap.ts';
import {
  CategoryError,
  createCategory,
  deleteCategory,
  listCategoriesWithUsage,
  slugify,
  updateCategory,
} from '../src/categories.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import { applyRules, createRule } from '../src/rules.ts';
import {
  accounts,
  budgets,
  categories,
  categoryAssignments,
  rules,
  splitLines,
  transactions,
} from '../src/schema.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

describe('slugify', () => {
  it('makes a readable slug', () => {
    expect(slugify('Rideshare & Taxis')).toBe('rideshare-taxis');
    expect(slugify('  Café  ')).toBe('cafe');
    expect(slugify('!!!')).toBe('category');
  });
});

describe.skipIf(!testDatabaseUrl)('categories and keyword suggestions', () => {
  let db: Database;
  let userId: string;
  let accountId: string;
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
      sql`truncate table category_assignments, split_lines, budgets, transactions, merchants, balance_snapshots, rules, bank_category_mappings, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;
    categoryIds = await ensureDefaultCategories(db, userId);
    await ensureBankCategoryMappings(db, userId, categoryIds);

    const [account] = await db
      .insert(accounts)
      .values({
        userId,
        adapterId: 'test',
        externalId: 'checking',
        name: 'Checking',
        type: 'checking',
        currency: 'USD',
      })
      .returning({ id: accounts.id });
    accountId = account!.id;
  });

  /** Adds an uncategorized transaction, the way an import leaves it. */
  async function addUncategorized(descriptionRaw: string, amountMinor = -1250) {
    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        accountId,
        externalId: `ext-${descriptionRaw}-${Math.random()}`,
        postedAt: new Date('2026-11-10T12:00:00Z'),
        postedDate: '2026-11-10',
        amountMinor,
        currency: 'USD',
        descriptionRaw,
        sourceAdapter: 'test',
      })
      .returning({ id: transactions.id });
    await db.insert(categoryAssignments).values({
      transactionId: row!.id,
      userId,
      categoryId: categoryIds.get('uncategorized')!,
      source: 'fallback',
      confidence: 0,
      reason: 'No rule, memory or bank category matched',
      locked: false,
    });
    return row!.id;
  }

  async function assignmentOf(transactionId: string) {
    const [row] = await db
      .select()
      .from(categoryAssignments)
      .where(eq(categoryAssignments.transactionId, transactionId));
    return row;
  }

  describe('keyword suggestions', () => {
    it('fills in a suggestion for existing uncategorized transactions', async () => {
      const uber = await addUncategorized('UBER *TRIP HELP.UBER.COM');
      const mta = await addUncategorized('MTA*NYCT PAYGO NEW YORK NY');
      const deli = await addUncategorized('JOES DELI BROOKLYN NY');
      const unknown = await addUncategorized('ACME HOLDINGS LLC');

      const applied = await applyRules(db, userId);
      expect(applied.changed).toBe(3);

      expect(await assignmentOf(uber)).toMatchObject({
        categoryId: categoryIds.get('transit'),
        source: 'keyword',
        locked: false,
      });
      expect((await assignmentOf(mta))?.categoryId).toBe(categoryIds.get('transit'));
      expect((await assignmentOf(deli))?.categoryId).toBe(categoryIds.get('restaurants'));
      expect((await assignmentOf(unknown))?.source).toBe('fallback');
    });

    it('keeps suggestions in the review inbox, with the suggestion ready to confirm', async () => {
      await addUncategorized('UBER *TRIP');
      await addUncategorized('UBER *TRIP');
      await applyRules(db, userId);

      const groups = await listReviewGroups(db, userId, { threshold: 0.8 });
      expect(groups).toHaveLength(1);
      expect(groups[0]?.transactions).toHaveLength(2);
      expect(groups[0]?.suggestedCategoryId).toBe(categoryIds.get('transit'));
      expect(groups[0]?.transactions[0]?.reason).toContain('"UBER"');
    });

    it('never overrides a manual edit', async () => {
      const uber = await addUncategorized('UBER *TRIP');
      await setManualCategory(db, userId, uber, categoryIds.get('travel')!);

      await applyRules(db, userId);
      expect(await assignmentOf(uber)).toMatchObject({
        categoryId: categoryIds.get('travel'),
        locked: true,
      });
    });

    it('keeps pointing at a default category after it is renamed', async () => {
      await updateCategory(db, userId, categoryIds.get('transit')!, { name: 'Subway & Rides' });
      const uber = await addUncategorized('UBER *TRIP');
      await applyRules(db, userId);

      const assignment = await assignmentOf(uber);
      expect(assignment?.categoryId).toBe(categoryIds.get('transit'));
      expect(assignment?.reason).toContain('Subway & Rides');
    });
  });

  describe('custom categories', () => {
    it('creates a top-level category of the user', async () => {
      const created = await createCategory(db, userId, { name: '  Pets  ' });

      expect(created).toMatchObject({
        name: 'Pets',
        slug: 'pets',
        kind: 'spending',
        isSystem: false,
        parentId: null,
      });
      expect(created.color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('nests a category under a group and takes its kind and colour', async () => {
      const created = await createCategory(db, userId, {
        name: 'Side gigs',
        kind: 'spending', // ignored: the parent decides
        parentId: categoryIds.get('income')!,
      });

      expect(created.kind).toBe('income');
      expect(created.parentId).toBe(categoryIds.get('income'));
      expect(created.color).toBe('#16a34a');
    });

    it('can be used for transactions and rules right away', async () => {
      const rideshare = await createCategory(db, userId, {
        name: 'Rideshare',
        parentId: categoryIds.get('transport')!,
      });
      const uber = await addUncategorized('UBER *TRIP');
      const lyft = await addUncategorized('LYFT *RIDE');

      await setManualCategory(db, userId, uber, rideshare.id);
      await createRule(db, userId, {
        name: 'Lyft → Rideshare',
        categoryId: rideshare.id,
        matchDescriptionPattern: 'LYFT',
      });
      await applyRules(db, userId);

      expect((await assignmentOf(uber))?.categoryId).toBe(rideshare.id);
      expect(await assignmentOf(lyft)).toMatchObject({
        categoryId: rideshare.id,
        source: 'user_rule',
      });

      const usage = await listCategoriesWithUsage(db, userId);
      expect(usage.find((category) => category.id === rideshare.id)).toMatchObject({
        transactionCount: 2,
        ruleCount: 1,
      });
    });

    it('refuses a duplicate name, ignoring case', async () => {
      await expect(createCategory(db, userId, { name: 'groceries' })).rejects.toThrow(
        CategoryError,
      );
    });

    it('refuses an empty name', async () => {
      await expect(createCategory(db, userId, { name: '   ' })).rejects.toThrow('needs a name');
    });

    it('gives a fresh slug when the name would collide with an existing slug', async () => {
      // Rename the default "Coffee" so the name is free, but the slug is not.
      await updateCategory(db, userId, categoryIds.get('coffee')!, { name: 'Cafes' });
      const created = await createCategory(db, userId, { name: 'Coffee' });
      expect(created.slug).toBe('coffee-2');
    });

    it('allows only one level of nesting', async () => {
      await expect(
        createCategory(db, userId, { name: 'Too deep', parentId: categoryIds.get('groceries')! }),
      ).rejects.toThrow('one level');
    });

    it('never nests under Transfer or Uncategorized', async () => {
      await expect(
        createCategory(db, userId, { name: 'Odd', parentId: categoryIds.get('transfer')! }),
      ).rejects.toThrow(CategoryError);
    });

    it('renames and recolours a category, keeping its slug', async () => {
      const updated = await updateCategory(db, userId, categoryIds.get('restaurants')!, {
        name: 'Eating out',
        color: '#123456',
      });
      expect(updated).toMatchObject({ name: 'Eating out', color: '#123456', slug: 'restaurants' });
    });

    it('keeps the kind of Transfer and Uncategorized', async () => {
      await expect(
        updateCategory(db, userId, categoryIds.get('transfer')!, { kind: 'spending' }),
      ).rejects.toThrow('cannot change its kind');
    });

    it('does not touch the categories of another user', async () => {
      await expect(
        updateCategory(db, userId, '00000000-0000-0000-0000-000000000000', { name: 'X' }),
      ).rejects.toThrow('not found');
    });
  });

  describe('deleting a category', () => {
    it('refuses to delete a default category', async () => {
      await expect(deleteCategory(db, userId, categoryIds.get('groceries')!)).rejects.toThrow(
        'cannot be deleted',
      );
    });

    it('sends its transactions back to the review inbox by default', async () => {
      const pets = await createCategory(db, userId, { name: 'Pets' });
      const chewy = await addUncategorized('CHEWY.COM');
      await setManualCategory(db, userId, chewy, pets.id);

      const result = await deleteCategory(db, userId, pets.id);

      expect(result.movedTransactions).toBe(1);
      expect(await assignmentOf(chewy)).toMatchObject({
        categoryId: categoryIds.get('uncategorized'),
        source: 'fallback',
        locked: false,
      });
      const [gone] = await db.select().from(categories).where(eq(categories.id, pets.id));
      expect(gone).toBeUndefined();
    });

    it('moves its transactions and split parts to the chosen category, keeping the lock', async () => {
      const pets = await createCategory(db, userId, { name: 'Pets' });
      const chewy = await addUncategorized('CHEWY.COM', -5000);
      await setManualCategory(db, userId, chewy, pets.id);
      await db.insert(splitLines).values([
        { userId, transactionId: chewy, categoryId: pets.id, amountMinor: -3000 },
        {
          userId,
          transactionId: chewy,
          categoryId: categoryIds.get('shopping')!,
          amountMinor: -2000,
        },
      ]);

      const result = await deleteCategory(db, userId, pets.id, {
        moveToCategoryId: categoryIds.get('shopping')!,
      });

      expect(result).toMatchObject({ movedTransactions: 1, movedSplitLines: 1 });
      expect(await assignmentOf(chewy)).toMatchObject({
        categoryId: categoryIds.get('shopping'),
        locked: true,
      });
      const parts = await db
        .select({ amountMinor: splitLines.amountMinor })
        .from(splitLines)
        .where(eq(splitLines.transactionId, chewy));
      // Nothing is lost: the parts still add up to the transaction.
      expect(parts.reduce((sum, part) => sum + part.amountMinor, 0)).toBe(-5000);
    });

    it('removes its rules and budgets, and lifts its children to the top level', async () => {
      const pets = await createCategory(db, userId, { name: 'Pets' });
      const vet = await createCategory(db, userId, { name: 'Vet', parentId: pets.id });
      await createRule(db, userId, {
        name: 'Chewy',
        categoryId: pets.id,
        matchDescriptionPattern: 'CHEWY',
      });
      await db.insert(budgets).values({ userId, categoryId: pets.id, amountMinor: 10_000 });

      const result = await deleteCategory(db, userId, pets.id);

      expect(result).toMatchObject({ deletedRules: 1, deletedBudgets: 1 });
      const [child] = await db.select().from(categories).where(eq(categories.id, vet.id));
      expect(child?.parentId).toBeNull();
      const leftover = await db
        .select()
        .from(rules)
        .where(and(eq(rules.userId, userId), eq(rules.categoryId, pets.id)));
      expect(leftover).toHaveLength(0);
    });

    it('refuses to move transactions into the category being deleted', async () => {
      const pets = await createCategory(db, userId, { name: 'Pets' });
      await expect(
        deleteCategory(db, userId, pets.id, { moveToCategoryId: pets.id }),
      ).rejects.toThrow('different category');
    });
  });
});
