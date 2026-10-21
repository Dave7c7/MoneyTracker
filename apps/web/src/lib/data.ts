/**
 * Server-side data access.
 *
 * Pages never talk to the database or an adapter directly: they call these
 * functions, which use the query layer and the aggregation functions in
 * `core`.
 */

import {
  addMonths,
  cashFlowByMonth,
  groupSmallCategories,
  monthKey,
  monthOverMonth,
  monthRange,
  spendingByCategory,
  topMerchants,
  type DashboardTransaction,
} from '@moneytracker/core';
import {
  countNeedsReview,
  listAccounts,
  listBalances,
  listCategories,
  listDashboardTransactions,
  listReviewGroups,
  listRules,
  listTransactions,
  getLocalUser,
  type TransactionRow,
} from '@moneytracker/db';

import { getDatabase } from './db.ts';
import { getEnv } from './env.ts';

/** A category with the color used by the charts. */
export interface CategoryOption {
  id: string;
  name: string;
  kind: 'spending' | 'income' | 'transfer' | 'uncategorized';
  color: string | null;
}

/** An account with its latest balance. */
export interface AccountSummary {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit_card' | 'loan' | 'cash';
  currency: string;
  mask: string | null;
  isLiability: boolean;
  balanceMinor: number | null;
  balanceAsOf: Date | null;
}

/**
 * Returns the local user id.
 *
 * Phase 6 replaces this with a real session. Everything is already scoped by
 * `user_id`.
 */
export async function getUserId(): Promise<string | null> {
  const { db } = getDatabase();
  const user = await getLocalUser(db);
  return user?.id ?? null;
}

/** Converts a transaction row into the shape the aggregation functions want. */
export function toDashboardTransaction(row: TransactionRow): DashboardTransaction {
  return {
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
  };
}

/** The current month bucket in the user's timezone. */
export function currentMonth(): string {
  return monthKey(new Date(), getEnv().APP_TIMEZONE);
}

/** The months to show on the dashboards, oldest first. */
export function recentMonths(count = 12, endMonth = currentMonth()): string[] {
  const start = addMonths(endMonth, -(count - 1));
  return monthRange(start, endMonth);
}

/** Data for the overview page. */
export async function getOverviewData(month = currentMonth()) {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const timeZone = getEnv().APP_TIMEZONE;
  const months = recentMonths(12, month);
  const rows = await listDashboardTransactions(db, userId);
  const transactions = rows.map(toDashboardTransaction);

  const spending = spendingByCategory(transactions, { timeZone, months });
  const cashFlow = cashFlowByMonth(transactions, { timeZone, months });
  const comparison = monthOverMonth(transactions, { month, timeZone });
  const merchants = topMerchants(transactions, { timeZone, months: [month], limit: 5 });
  const accounts = await listAccounts(db, userId);
  const needsReview = await countNeedsReview(db, userId);
  const recent = await listTransactions(db, userId, { limit: 6 });

  return {
    month,
    months,
    timeZone,
    spending,
    cashFlow,
    comparison,
    topMerchants: merchants,
    accounts: accounts.map(toAccountSummary),
    needsReview,
    recent,
  };
}

/** Data for the spending page. */
export async function getSpendingData(month = currentMonth()) {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const timeZone = getEnv().APP_TIMEZONE;
  const months = recentMonths(12, month);
  const rows = await listDashboardTransactions(db, userId);
  const transactions = rows.map(toDashboardTransaction);

  const spending = spendingByCategory(transactions, { timeZone, months });
  const grouped = groupSmallCategories(spending.categories, { topN: 7, label: 'Other' });
  const comparison = monthOverMonth(transactions, { month, timeZone });

  return {
    month,
    months,
    timeZone,
    categories: grouped,
    totalCategories: spending.categories.length,
    comparison,
    previousComparison: monthOverMonth(transactions, {
      month: comparison.previousMonth,
      timeZone,
    }),
  };
}

/** Data for the cash flow page. */
export async function getCashFlowData(month = currentMonth()) {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const timeZone = getEnv().APP_TIMEZONE;
  const months = recentMonths(12, month);
  const rows = await listDashboardTransactions(db, userId);
  const transactions = rows.map(toDashboardTransaction);
  const cashFlow = cashFlowByMonth(transactions, { timeZone, months });

  const totals = cashFlow.reduce(
    (sum, entry) => ({
      incomeMinor: sum.incomeMinor + entry.incomeMinor,
      expenseMinor: sum.expenseMinor + entry.expenseMinor,
      netMinor: sum.netMinor + entry.netMinor,
    }),
    { incomeMinor: 0, expenseMinor: 0, netMinor: 0 },
  );

  const current = cashFlow.find((entry) => entry.month === month);

  return { month, months, timeZone, cashFlow, totals, current };
}

/** Data for the accounts page. */
export async function getAccountsData() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const accounts = await listAccounts(db, userId);
  const balances = await listBalances(db, userId);

  const summaries = accounts.map(toAccountSummary);
  const assetsMinor = summaries
    .filter((account) => !account.isLiability)
    .reduce((sum, account) => sum + (account.balanceMinor ?? 0), 0);
  const liabilitiesMinor = summaries
    .filter((account) => account.isLiability)
    .reduce((sum, account) => sum + (account.balanceMinor ?? 0), 0);

  return {
    accounts: summaries,
    netWorthMinor: assetsMinor + liabilitiesMinor,
    assetsMinor,
    liabilitiesMinor,
    balances,
  };
}

/** Data for the transactions page. */
export async function getTransactionsData(filters: Parameters<typeof listTransactions>[2] = {}) {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const [rows, categories, accounts] = await Promise.all([
    listTransactions(db, userId, filters),
    listCategories(db, userId),
    listAccounts(db, userId),
  ]);

  return {
    rows,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
      color: category.color,
    })),
    accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
  };
}

/** Data for the review inbox. */
export async function getReviewData() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const [groups, categories, needsReview] = await Promise.all([
    listReviewGroups(db, userId),
    listCategories(db, userId),
    countNeedsReview(db, userId),
  ]);

  return {
    groups,
    needsReview,
    totalTransactions: groups.reduce((sum, group) => sum + group.transactions.length, 0),
    categories: categories
      .filter((category) => category.kind === 'spending' || category.kind === 'income')
      .map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
        color: category.color,
      })),
  };
}

/** Data for the rules screen. */
export async function getRulesData() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const [rules, categories, accounts] = await Promise.all([
    listRules(db, userId),
    listCategories(db, userId),
    listAccounts(db, userId),
  ]);

  return {
    rules,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
      color: category.color,
    })),
    accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
  };
}

/** Converts a database account row into the summary shape the UI wants. */
function toAccountSummary(account: {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit_card' | 'loan' | 'cash';
  currency: string;
  mask: string | null;
  isLiability: boolean;
  latestBalanceMinor: number | null;
  latestBalanceAt: Date | null;
}): AccountSummary {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    mask: account.mask,
    isLiability: account.isLiability,
    balanceMinor: account.latestBalanceMinor,
    balanceAsOf: account.latestBalanceAt,
  };
}
