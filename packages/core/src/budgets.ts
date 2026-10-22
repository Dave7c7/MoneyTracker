/**
 * Budgets.
 *
 * A budget is a limit the user set for one category in one month. The app
 * never changes it; it shows what has been spent against it, and what is left.
 *
 * Rollover means the money that was not spent in a month is available in the
 * next one. It is only ever a limit the user gave themselves, so the app
 * shows the number and leaves the decision alone.
 */

import { addMonths, monthKey, type MonthKey } from './dates.ts';
import type { CategoryKind } from './types.ts';

/** What the user set for one category. */
export interface Budget {
  categoryId: string;
  categoryName: string;
  /** The limit for one month, in minor units. */
  amountMinor: number;
  /** When true, money left over is added to the next month. */
  rollover: boolean;
}

/** A budget and what happened against it. */
export interface BudgetStatus {
  categoryId: string;
  categoryName: string;
  /** The limit for this month. */
  budgetMinor: number;
  /** What was spent in the month. */
  spentMinor: number;
  /** What was left over in the previous months and carried over. */
  carriedMinor: number;
  /** The limit the month really had, including the carry-over. */
  effectiveBudgetMinor: number;
  /** What is left. Negative when the limit was passed. */
  remainingMinor: number;
  /** How much of the limit is used, as a percentage. */
  percentUsed: number;
  /** True when the spending is over the limit. */
  overBudget: boolean;
}

/** The transaction shape the budget functions need. */
export interface BudgetTransaction {
  postedAt: Date | null;
  amountMinor: number;
  categoryId: string | null;
  categoryKind: CategoryKind;
  pending: boolean;
}

/** Options for the budget functions. */
export interface BudgetOptions {
  /** The month to report on. */
  month: MonthKey;
  timeZone: string;
  /**
   * How many months of leftover are carried over.
   *
   * One month is the usual meaning of a rollover: what was left over last
   * month is available this month. Defaults to 1.
   */
  carryMonths?: number;
}

/**
 * What was spent in one category in one month.
 *
 * Transfers and pending transactions do not count: a transfer is not
 * spending, and a pending charge has not happened yet.
 *
 * @example
 * spendingInCategory(transactions, 'cat-1', '2026-01', 'UTC'); // 1999
 */
export function spendingInCategory(
  transactions: readonly BudgetTransaction[],
  categoryId: string,
  month: MonthKey,
  timeZone: string,
): number {
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.pending) continue;
    if (transaction.postedAt === null) continue;
    if (transaction.categoryKind === 'transfer' || transaction.categoryKind === 'income') continue;
    if (transaction.categoryId !== categoryId) continue;
    if (monthKey(transaction.postedAt, timeZone) !== month) continue;
    total += -transaction.amountMinor;
  }
  return total;
}

/**
 * The budgets of one month, with what was spent against them.
 *
 * A refund reduces the spending of its category, so a category that was
 * refunded in the month shows less spent than the charges alone would say.
 *
 * @example
 * budgetStatus(transactions, budgets, { month: '2026-01', timeZone: 'UTC' });
 */
export function budgetStatus(
  transactions: readonly BudgetTransaction[],
  budgets: readonly Budget[],
  options: BudgetOptions,
): BudgetStatus[] {
  const carryMonths = options.carryMonths ?? 1;

  return budgets.map((budget) => {
    const spentMinor = spendingInCategory(
      transactions,
      budget.categoryId,
      options.month,
      options.timeZone,
    );

    let carriedMinor = 0;
    if (budget.rollover) {
      for (let back = 1; back <= carryMonths; back += 1) {
        const month = addMonths(options.month, -back);
        const spent = spendingInCategory(transactions, budget.categoryId, month, options.timeZone);
        const left = budget.amountMinor - spent;
        if (left > 0) carriedMinor += left;
      }
    }

    const effectiveBudgetMinor = budget.amountMinor + carriedMinor;
    const remainingMinor = effectiveBudgetMinor - spentMinor;
    const percentUsed =
      effectiveBudgetMinor > 0 ? Math.round((spentMinor / effectiveBudgetMinor) * 1000) / 10 : 0;

    return {
      categoryId: budget.categoryId,
      categoryName: budget.categoryName,
      budgetMinor: budget.amountMinor,
      spentMinor,
      carriedMinor,
      effectiveBudgetMinor,
      remainingMinor,
      percentUsed,
      overBudget: spentMinor > effectiveBudgetMinor,
    };
  });
}
