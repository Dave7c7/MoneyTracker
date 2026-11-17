/**
 * The categories service.
 *
 * The default tree ships with the app; users add their own categories next
 * to it, rename any of them, and delete the ones they made.
 *
 * Three things hold, always:
 *
 * - System categories (the defaults) are never deleted. Transfer and
 *   Uncategorized also keep their kind, because the pipeline depends on them.
 * - A slug never changes after creation, so renaming a default category keeps
 *   its keyword suggestions and bank mappings working.
 * - Deleting a category never loses a transaction: its assignments and split
 *   parts move to another category first.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import type { CategoryKind } from '@moneytracker/core';

import type { Database } from './client.ts';
import { budgets, categories, categoryAssignments, rules, splitLines } from './schema.ts';

/** A category as it is stored. */
export type CategoryRow = typeof categories.$inferSelect;

/** The kinds a user may give a category of their own. */
export type UserCategoryKind = Extract<CategoryKind, 'spending' | 'income'>;

/** The fields of a new category. */
export interface CategoryInput {
  name: string;
  kind?: UserCategoryKind;
  parentId?: string | null;
  color?: string | null;
}

/** The fields of a category that can change. */
export interface CategoryUpdate {
  name?: string;
  color?: string | null;
  parentId?: string | null;
  kind?: UserCategoryKind;
}

/** A category with how much depends on it, for the management screen. */
export interface CategoryWithUsage extends CategoryRow {
  transactionCount: number;
  ruleCount: number;
  budgetCount: number;
}

/** What deleting a category did. */
export interface DeleteCategoryResult {
  /** Transactions moved to the target category. */
  movedTransactions: number;
  /** Split parts moved to the target category. */
  movedSplitLines: number;
  /** Rules that pointed at the category and were removed with it. */
  deletedRules: number;
  /** Budgets for the category, removed with it. */
  deletedBudgets: number;
}

/** A reason a category change was refused, for the API to report. */
export class CategoryError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = 'CategoryError';
  }
}

/** Colours for a new top-level category, picked in order. */
const CUSTOM_COLORS = [
  '#0ea5e9',
  '#f97316',
  '#a855f7',
  '#14b8a6',
  '#ef4444',
  '#84cc16',
  '#ec4899',
  '#6366f1',
];

/** Sort order for new top-level categories: after the defaults, before Transfer. */
const CUSTOM_TOP_LEVEL_SORT_ORDER = 95;

/**
 * Turns a name into a slug.
 *
 * @example
 * slugify('Rideshare & Taxis'); // "rideshare-taxis"
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'category';
}

function cleanName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) throw new CategoryError('A category needs a name', 400);
  if (cleaned.length > 60) throw new CategoryError('Keep the name under 60 characters', 400);
  return cleaned;
}

async function loadAll(db: Database, userId: string): Promise<CategoryRow[]> {
  return db.select().from(categories).where(eq(categories.userId, userId));
}

function assertUniqueName(all: CategoryRow[], name: string, exceptId?: string): void {
  const taken = all.some(
    (category) => category.id !== exceptId && category.name.toLowerCase() === name.toLowerCase(),
  );
  if (taken) throw new CategoryError(`You already have a category called "${name}"`, 409);
}

/**
 * Checks that a parent can hold a child: it exists, it is top level, and it
 * is a spending or income category.
 */
function resolveParent(all: CategoryRow[], parentId: string, childId?: string): CategoryRow {
  const parent = all.find((category) => category.id === parentId);
  if (!parent) throw new CategoryError('The parent category does not exist', 404);
  if (parent.id === childId) throw new CategoryError('A category cannot be its own parent', 400);
  if (parent.parentId) throw new CategoryError('Categories can only be nested one level', 400);
  if (parent.kind !== 'spending' && parent.kind !== 'income') {
    throw new CategoryError('Only spending and income categories can have children', 400);
  }
  if (childId && all.some((category) => category.parentId === childId)) {
    throw new CategoryError('A category with children cannot be nested itself', 400);
  }
  return parent;
}

/**
 * Lists the user's categories with how many transactions, rules and budgets
 * use each one.
 *
 * @example
 * const list = await listCategoriesWithUsage(db, userId);
 * list[0].transactionCount; // 42
 */
export async function listCategoriesWithUsage(
  db: Database,
  userId: string,
): Promise<CategoryWithUsage[]> {
  const [rows, assignmentCounts, ruleCounts, budgetCounts] = await Promise.all([
    loadAll(db, userId),
    db
      .select({ categoryId: categoryAssignments.categoryId, count: sql<number>`count(*)::int` })
      .from(categoryAssignments)
      .where(eq(categoryAssignments.userId, userId))
      .groupBy(categoryAssignments.categoryId),
    db
      .select({ categoryId: rules.categoryId, count: sql<number>`count(*)::int` })
      .from(rules)
      .where(eq(rules.userId, userId))
      .groupBy(rules.categoryId),
    db
      .select({ categoryId: budgets.categoryId, count: sql<number>`count(*)::int` })
      .from(budgets)
      .where(eq(budgets.userId, userId))
      .groupBy(budgets.categoryId),
  ]);

  const toMap = (list: Array<{ categoryId: string; count: number }>) =>
    new Map(list.map((row) => [row.categoryId, row.count]));
  const transactionsBy = toMap(assignmentCounts);
  const rulesBy = toMap(ruleCounts);
  const budgetsBy = toMap(budgetCounts);

  return rows
    .map((row) => ({
      ...row,
      transactionCount: transactionsBy.get(row.id) ?? 0,
      ruleCount: rulesBy.get(row.id) ?? 0,
      budgetCount: budgetsBy.get(row.id) ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * Creates a category of the user's own.
 *
 * A child takes its parent's kind and, unless a colour is given, its colour.
 *
 * @example
 * await createCategory(db, userId, { name: 'Rideshare', parentId: transportId });
 */
export async function createCategory(
  db: Database,
  userId: string,
  input: CategoryInput,
): Promise<CategoryRow> {
  const name = cleanName(input.name);
  const all = await loadAll(db, userId);
  assertUniqueName(all, name);

  const parent = input.parentId ? resolveParent(all, input.parentId) : null;
  const kind: CategoryKind = parent ? parent.kind : (input.kind ?? 'spending');

  const slugs = new Set(all.map((category) => category.slug));
  const base = slugify(name);
  let slug = base;
  for (let suffix = 2; slugs.has(slug); suffix += 1) slug = `${base}-${suffix}`;

  let sortOrder = CUSTOM_TOP_LEVEL_SORT_ORDER;
  if (parent) {
    const siblings = all.filter((category) => category.parentId === parent.id);
    sortOrder = Math.max(parent.sortOrder, ...siblings.map((category) => category.sortOrder)) + 1;
  }

  const customCount = all.filter((category) => !category.isSystem && !category.parentId).length;
  const color =
    input.color ?? parent?.color ?? CUSTOM_COLORS[customCount % CUSTOM_COLORS.length] ?? null;

  const [row] = await db
    .insert(categories)
    .values({
      userId,
      name,
      slug,
      kind,
      color,
      parentId: parent?.id ?? null,
      isSystem: false,
      sortOrder,
    })
    .returning();

  if (!row) throw new Error('Could not create the category');
  return row;
}

/**
 * Renames, recolours or moves a category.
 *
 * The slug stays as it was. Transfer and Uncategorized keep their kind and
 * stay at the top level.
 *
 * @example
 * await updateCategory(db, userId, id, { name: 'Eating out' });
 */
export async function updateCategory(
  db: Database,
  userId: string,
  categoryId: string,
  update: CategoryUpdate,
): Promise<CategoryRow> {
  const all = await loadAll(db, userId);
  const current = all.find((category) => category.id === categoryId);
  if (!current) throw new CategoryError('Category not found', 404);

  const structural = current.kind === 'transfer' || current.kind === 'uncategorized';
  const changes: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() };

  if (update.name !== undefined) {
    const name = cleanName(update.name);
    assertUniqueName(all, name, categoryId);
    changes.name = name;
  }

  if (update.color !== undefined) changes.color = update.color;

  if (update.parentId !== undefined) {
    if (structural && update.parentId !== null) {
      throw new CategoryError(`${current.name} always stays at the top level`, 400);
    }
    if (update.parentId === null) {
      changes.parentId = null;
    } else {
      const parent = resolveParent(all, update.parentId, categoryId);
      changes.parentId = parent.id;
      changes.kind = parent.kind;
    }
  }

  if (update.kind !== undefined && update.kind !== current.kind) {
    if (structural) throw new CategoryError(`${current.name} cannot change its kind`, 400);
    const parentId = changes.parentId !== undefined ? changes.parentId : current.parentId;
    if (parentId) throw new CategoryError('A nested category takes the kind of its parent', 400);
    changes.kind = update.kind;
  }

  const [row] = await db
    .update(categories)
    .set(changes)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .returning();
  if (!row) throw new CategoryError('Category not found', 404);

  // Children always share the kind of their parent.
  if (changes.kind && !row.parentId) {
    await db
      .update(categories)
      .set({ kind: changes.kind, updatedAt: new Date() })
      .where(and(eq(categories.userId, userId), eq(categories.parentId, categoryId)));
  }

  return row;
}

/**
 * Deletes a category the user made.
 *
 * Its transactions and split parts move to `moveToCategoryId` (Uncategorized
 * when not given). Moved to Uncategorized, they are unlocked and go back to
 * the review inbox; moved anywhere else, they keep their lock, because the
 * user chose the destination. Rules and budgets for the category go with it,
 * and its children become top-level categories.
 *
 * @example
 * const result = await deleteCategory(db, userId, id);
 * result.movedTransactions; // 7
 */
export async function deleteCategory(
  db: Database,
  userId: string,
  categoryId: string,
  options: { moveToCategoryId?: string | null } = {},
): Promise<DeleteCategoryResult> {
  const all = await loadAll(db, userId);
  const current = all.find((category) => category.id === categoryId);
  if (!current) throw new CategoryError('Category not found', 404);
  if (current.isSystem) {
    throw new CategoryError(
      `${current.name} ships with the app and cannot be deleted; rename it instead`,
      400,
    );
  }

  const target = options.moveToCategoryId
    ? all.find((category) => category.id === options.moveToCategoryId)
    : all.find((category) => category.kind === 'uncategorized');
  if (!target) throw new CategoryError('The category to move transactions to does not exist', 404);
  if (target.id === categoryId) {
    throw new CategoryError('Choose a different category to move the transactions to', 400);
  }

  return db.transaction(async (tx) => {
    const toUncategorized = target.kind === 'uncategorized';

    const moved = await tx
      .update(categoryAssignments)
      .set(
        toUncategorized
          ? {
              categoryId: target.id,
              source: 'fallback',
              confidence: 0,
              reason: `Category "${current.name}" was deleted`,
              locked: false,
              updatedAt: new Date(),
            }
          : {
              categoryId: target.id,
              reason: `Moved from deleted category "${current.name}"`,
              updatedAt: new Date(),
            },
      )
      .where(
        and(eq(categoryAssignments.userId, userId), eq(categoryAssignments.categoryId, categoryId)),
      )
      .returning({ id: categoryAssignments.transactionId });

    const movedSplits = await tx
      .update(splitLines)
      .set({ categoryId: target.id })
      .where(and(eq(splitLines.userId, userId), eq(splitLines.categoryId, categoryId)))
      .returning({ id: splitLines.id });

    const deletedRules = await tx
      .delete(rules)
      .where(and(eq(rules.userId, userId), eq(rules.categoryId, categoryId)))
      .returning({ id: rules.id });

    const deletedBudgets = await tx
      .delete(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, categoryId)))
      .returning({ id: budgets.id });

    const children = all.filter((category) => category.parentId === categoryId);
    if (children.length > 0) {
      await tx
        .update(categories)
        .set({ parentId: null, updatedAt: new Date() })
        .where(
          and(
            eq(categories.userId, userId),
            inArray(
              categories.id,
              children.map((child) => child.id),
            ),
          ),
        );
    }

    await tx
      .delete(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));

    return {
      movedTransactions: moved.length,
      movedSplitLines: movedSplits.length,
      deletedRules: deletedRules.length,
      deletedBudgets: deletedBudgets.length,
    };
  });
}
