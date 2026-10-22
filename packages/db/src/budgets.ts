/**
 * The budget service.
 *
 * A budget is a limit the user set for one category. The app stores the limit
 * and works out the rest: what was spent against it, and what is left.
 */

import { and, eq } from 'drizzle-orm';

import type { Budget } from '@moneytracker/core';

import type { Database } from './client.ts';
import { budgets, categories } from './schema.ts';

/** A budget as it is stored. */
export interface BudgetRow {
  id: string;
  categoryId: string;
  categoryName: string;
  amountMinor: number;
  rollover: boolean;
}

/**
 * Lists the budgets of the user, with the name of the category.
 *
 * @example
 * const budgets = await listBudgets(db, userId);
 */
export async function listBudgets(db: Database, userId: string): Promise<BudgetRow[]> {
  const rows = await db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      amountMinor: budgets.amountMinor,
      rollover: budgets.rollover,
    })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(eq(budgets.userId, userId));

  return rows;
}

/** The budgets in the shape the aggregation functions want. */
export function toBudgets(rows: readonly BudgetRow[]): Budget[] {
  return rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    amountMinor: row.amountMinor,
    rollover: row.rollover,
  }));
}

/**
 * Sets the budget for a category.
 *
 * A category has one budget: setting it again changes it.
 *
 * @example
 * await setBudget(db, userId, { categoryId, amountMinor: 50_000, rollover: false });
 */
export async function setBudget(
  db: Database,
  userId: string,
  input: { categoryId: string; amountMinor: number; rollover?: boolean },
): Promise<BudgetRow | null> {
  await db
    .insert(budgets)
    .values({
      userId,
      categoryId: input.categoryId,
      amountMinor: input.amountMinor,
      rollover: input.rollover ?? false,
    })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId],
      set: {
        amountMinor: input.amountMinor,
        rollover: input.rollover ?? false,
        updatedAt: new Date(),
      },
    });

  const rows = await listBudgets(db, userId);
  return rows.find((row) => row.categoryId === input.categoryId) ?? null;
}

/**
 * Removes every budget, so the database is the way it was found.
 *
 * @example
 * await removeBudgets(db, userId);
 */
export async function removeBudgets(db: Database, userId: string): Promise<void> {
  await db.delete(budgets).where(eq(budgets.userId, userId));
}

/**
 * Removes a budget.
 *
 * @example
 * await deleteBudget(db, userId, id);
 */
export async function deleteBudget(db: Database, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(budgets)
    .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
    .returning({ id: budgets.id });
  return rows.length > 0;
}
