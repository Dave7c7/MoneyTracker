/**
 * Dashboard aggregation.
 *
 * All aggregation lives here, in pure functions over a flat transaction view.
 * Components never sum money themselves; they render what these functions
 * return. Totals exclude transfers and pending transactions.
 */

import { monthKey, type MonthKey } from './dates.ts';
import type { CategoryKind } from './types.ts';

/** The transaction shape the dashboard functions need. */
export interface DashboardTransaction {
  id: string;
  accountId: string;
  /** UTC timestamp. Null for pending transactions. */
  postedAt: Date | null;
  amountMinor: number;
  currency: string;
  pending: boolean;
  merchantId: string | null;
  merchantName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: CategoryKind;
}

/** Options shared by the monthly aggregations. */
export interface MonthlyOptions {
  timeZone: string;
  /** Restrict to these months. When omitted, every month present is returned. */
  months?: readonly MonthKey[];
}

/** One category's spending in one month, in minor units. */
export interface CategoryMonthSeries {
  categoryId: string;
  categoryName: string;
  /** Signed: positive means money spent, negative means refunded. */
  monthly: number[];
}

/** Spending by category over time, shaped for a stacked bar chart. */
export interface SpendingByCategory {
  months: MonthKey[];
  categories: CategoryMonthSeries[];
}

/** Income versus expenses for one month. */
export interface CashFlowMonth {
  month: MonthKey;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

/** A merchant ranked by spending. */
export interface MerchantTotal {
  merchantId: string;
  merchantName: string;
  totalMinor: number;
  transactionCount: number;
}

/** Current month compared to the previous month. */
export interface MonthOverMonth {
  month: MonthKey;
  previousMonth: MonthKey;
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  /** Percentage change, or null when the previous month was zero. */
  deltaPercent: number | null;
}

function isCountable(tx: DashboardTransaction): boolean {
  return !tx.pending && tx.postedAt !== null && tx.categoryKind !== 'transfer';
}

function monthOf(tx: DashboardTransaction, timeZone: string): MonthKey | null {
  return tx.postedAt ? monthKey(tx.postedAt, timeZone) : null;
}

/**
 * Spending per category per month.
 *
 * Refunds are positive amounts in a spending category and reduce that
 * category's spending rather than counting as income.
 *
 * @example
 * spendingByCategory([tx], { timeZone: 'UTC' }).categories[0].monthly; // [1999]
 */
export function spendingByCategory(
  transactions: readonly DashboardTransaction[],
  options: MonthlyOptions,
): SpendingByCategory {
  const spendable = transactions.filter(
    (tx) =>
      isCountable(tx) && (tx.categoryKind === 'spending' || tx.categoryKind === 'uncategorized'),
  );

  const months = options.months ? [...options.months] : monthsPresent(spendable, options.timeZone);
  const monthIndex = new Map(months.map((month, index) => [month, index]));

  const byCategory = new Map<string, CategoryMonthSeries>();
  for (const tx of spendable) {
    const month = monthOf(tx, options.timeZone);
    if (!month) continue;
    const index = monthIndex.get(month);
    if (index === undefined) continue;

    const categoryId = tx.categoryId ?? 'uncategorized';
    let series = byCategory.get(categoryId);
    if (!series) {
      series = {
        categoryId,
        categoryName: tx.categoryName ?? 'Uncategorized',
        monthly: new Array<number>(months.length).fill(0),
      };
      byCategory.set(categoryId, series);
    }
    // Negative amount = money out. Negate so spending reads positive.
    series.monthly[index] = (series.monthly[index] ?? 0) - tx.amountMinor;
  }

  const categories = [...byCategory.values()].sort(
    (a, b) =>
      totalOf(b.monthly) - totalOf(a.monthly) || a.categoryName.localeCompare(b.categoryName),
  );

  return { months, categories };
}

/**
 * Income, expenses and net savings per month.
 *
 * Transfers are excluded. Uncategorized spending still counts as an expense,
 * because money left the account even if we do not know what it was for.
 *
 * @example
 * cashFlowByMonth([tx], { timeZone: 'UTC' }); // [{ month: '2026-01', incomeMinor: 500000, expenseMinor: 1999, netMinor: 498001 }]
 */
export function cashFlowByMonth(
  transactions: readonly DashboardTransaction[],
  options: MonthlyOptions,
): CashFlowMonth[] {
  const countable = transactions.filter(isCountable);
  const months = options.months ? [...options.months] : monthsPresent(countable, options.timeZone);
  const monthIndex = new Map(months.map((month, index) => [month, index]));

  const income = new Array<number>(months.length).fill(0);
  const spendByCategory = new Map<string, Map<number, number>>();

  for (const tx of countable) {
    const month = monthOf(tx, options.timeZone);
    if (!month) continue;
    const index = monthIndex.get(month);
    if (index === undefined) continue;

    if (tx.categoryKind === 'income') {
      if (tx.amountMinor > 0) {
        income[index] = (income[index] ?? 0) + tx.amountMinor;
      } else {
        // Money leaving an income category (e.g. a repayment) is an expense.
        addSpend(spendByCategory, 'income-negative', index, -tx.amountMinor);
      }
      continue;
    }

    // Spending and uncategorized. Positive amounts are refunds and reduce spend.
    const categoryId = tx.categoryId ?? 'uncategorized';
    addSpend(spendByCategory, categoryId, index, -tx.amountMinor);
  }

  return months.map((month, index) => {
    let expenseMinor = 0;
    for (const perMonth of spendByCategory.values()) {
      const value = perMonth.get(index) ?? 0;
      expenseMinor += Math.max(0, value);
    }
    const incomeMinor = income[index] ?? 0;
    return {
      month,
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
    };
  });
}

/**
 * The merchants the user spent the most money with.
 *
 * Refunds are netted off, so a merchant that refunded part of a purchase
 * does not look bigger than it is.
 *
 * @example
 * topMerchants(transactions, { limit: 5 });
 */
export function topMerchants(
  transactions: readonly DashboardTransaction[],
  options: { limit?: number; timeZone: string; months?: readonly MonthKey[] },
): MerchantTotal[] {
  const allowed = options.months ? new Set(options.months) : null;
  const totals = new Map<string, MerchantTotal>();

  for (const tx of transactions) {
    if (!isCountable(tx)) continue;
    if (tx.categoryKind === 'income') continue;
    const month = monthOf(tx, options.timeZone);
    if (!month) continue;
    if (allowed && !allowed.has(month)) continue;

    const merchantId = tx.merchantId ?? tx.merchantName ?? 'unknown';
    const existing = totals.get(merchantId);
    if (existing) {
      existing.totalMinor += -tx.amountMinor;
      existing.transactionCount += 1;
    } else {
      totals.set(merchantId, {
        merchantId,
        merchantName: tx.merchantName ?? 'Unknown Merchant',
        totalMinor: -tx.amountMinor,
        transactionCount: 1,
      });
    }
  }

  const sorted = [...totals.values()].sort(
    (a, b) => b.totalMinor - a.totalMinor || a.merchantName.localeCompare(b.merchantName),
  );

  return options.limit ? sorted.slice(0, options.limit) : sorted;
}

/**
 * Total spending in a month compared to the month before it.
 *
 * @example
 * monthOverMonth(transactions, { month: '2026-01', timeZone: 'UTC' });
 */
export function monthOverMonth(
  transactions: readonly DashboardTransaction[],
  options: { month: MonthKey; timeZone: string },
): MonthOverMonth {
  const [yearPart, monthPart] = options.month.split('-');
  const previousDate = new Date(Date.UTC(Number(yearPart), Number(monthPart) - 2, 1));
  const previousMonth = `${String(previousDate.getUTCFullYear()).padStart(4, '0')}-${String(previousDate.getUTCMonth() + 1).padStart(2, '0')}`;

  const currentMinor = spendingInMonth(transactions, options.month, options.timeZone);
  const previousMinor = spendingInMonth(transactions, previousMonth, options.timeZone);
  const deltaMinor = currentMinor - previousMinor;

  return {
    month: options.month,
    previousMonth,
    currentMinor,
    previousMinor,
    deltaMinor,
    deltaPercent: previousMinor === 0 ? null : (deltaMinor / previousMinor) * 100,
  };
}

/**
 * Total spending in one month, excluding transfers and pending transactions.
 *
 * @example
 * spendingInMonth(transactions, '2026-01', 'UTC'); // 1999
 */
export function spendingInMonth(
  transactions: readonly DashboardTransaction[],
  month: MonthKey,
  timeZone: string,
): number {
  let total = 0;
  for (const tx of transactions) {
    if (!isCountable(tx)) continue;
    if (tx.categoryKind !== 'spending' && tx.categoryKind !== 'uncategorized') continue;
    if (monthOf(tx, timeZone) !== month) continue;
    total += -tx.amountMinor;
  }
  return total;
}

/**
 * Groups the tail of a category list into a single "Other" entry so charts
 * stay readable with many categories.
 *
 * @example
 * groupSmallCategories([a, b, c], { topN: 2 }).map((entry) => entry.categoryName); // ['A', 'B', 'Other']
 */
export function groupSmallCategories(
  series: readonly CategoryMonthSeries[],
  options: { topN: number; label?: string },
): CategoryMonthSeries[] {
  const label = options.label ?? 'Other';
  if (series.length <= options.topN) {
    return [...series];
  }

  const head = series.slice(0, options.topN);
  const tail = series.slice(options.topN);
  const monthly = new Array<number>(head[0]?.monthly.length ?? 0).fill(0);
  for (const entry of tail) {
    for (let index = 0; index < monthly.length; index += 1) {
      monthly[index] = (monthly[index] ?? 0) + (entry.monthly[index] ?? 0);
    }
  }

  return [...head, { categoryId: 'other', categoryName: label, monthly }];
}

/** A balance snapshot the net worth series needs. */
export interface BalanceSnapshot {
  accountId: string;
  asOf: Date;
  balanceMinor: number;
}

/** Net worth at the end of one month. */
export interface NetWorthPoint {
  month: MonthKey;
  /** What the accounts hold, not counting what is owed. */
  assetsMinor: number;
  /** What is owed. Negative, because a card balance is money owed. */
  liabilitiesMinor: number;
  /** Assets and liabilities together. */
  netMinor: number;
}

/**
 * Net worth over time, from the balance snapshots.
 *
 * Net worth is never summed from transactions: it comes from the snapshots
 * the accounts reported. A month uses the last snapshot of every account up
 * to the end of that month, so a month with no snapshot still shows what was
 * known at the time.
 *
 * @example
 * netWorthSeries(snapshots, { months: ['2026-01'], isLiability: () => false });
 */
export function netWorthSeries(
  snapshots: readonly BalanceSnapshot[],
  options: { months: readonly MonthKey[]; isLiability: (accountId: string) => boolean },
): NetWorthPoint[] {
  const sorted = [...snapshots].sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
  const latest = new Map<string, number>();
  let cursor = 0;

  return options.months.map((month) => {
    const monthEnd = startOfNextMonth(month);
    while (cursor < sorted.length) {
      const snapshot = sorted[cursor];
      if (!snapshot || snapshot.asOf.getTime() >= monthEnd) break;
      latest.set(snapshot.accountId, snapshot.balanceMinor);
      cursor += 1;
    }

    let assetsMinor = 0;
    let liabilitiesMinor = 0;
    for (const [accountId, balanceMinor] of latest) {
      if (options.isLiability(accountId)) liabilitiesMinor += balanceMinor;
      else assetsMinor += balanceMinor;
    }

    return {
      month,
      assetsMinor,
      liabilitiesMinor,
      netMinor: assetsMinor + liabilitiesMinor,
    };
  });
}

/** The first instant of the month after the given one. */
function startOfNextMonth(month: MonthKey): number {
  const [yearPart, monthPart] = month.split('-');
  return Date.UTC(Number(yearPart), Number(monthPart), 1);
}

function addSpend(
  spendByCategory: Map<string, Map<number, number>>,
  categoryId: string,
  index: number,
  amount: number,
): void {
  let perMonth = spendByCategory.get(categoryId);
  if (!perMonth) {
    perMonth = new Map<number, number>();
    spendByCategory.set(categoryId, perMonth);
  }
  perMonth.set(index, (perMonth.get(index) ?? 0) + amount);
}

function monthsPresent(
  transactions: readonly DashboardTransaction[],
  timeZone: string,
): MonthKey[] {
  const months = new Set<MonthKey>();
  for (const tx of transactions) {
    const month = monthOf(tx, timeZone);
    if (month) months.add(month);
  }
  return [...months].sort();
}

function totalOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
