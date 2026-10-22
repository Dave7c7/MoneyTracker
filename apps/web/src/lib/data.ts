/**
 * Server-side data access.
 *
 * Pages never talk to the database or an adapter directly: they call these
 * functions, which use the query layer and the aggregation functions in
 * `core`.
 */

import {
  addMonths,
  budgetStatus,
  cashFlowByMonth,
  goalProgress,
  groupSmallCategories,
  monthKey,
  monthOverMonth,
  monthRange,
  netWorthSeries,
  recurringTotals,
  spendingByCategory,
  toPlainDate,
  topMerchants,
  upcomingRecurring,
  type DashboardTransaction,
} from '@moneytracker/core';
import {
  countNeedsReview,
  listAccounts,
  listBalances,
  listBudgets,
  listCategories,
  listDashboardTransactions,
  listImportProfiles,
  listConnections,
  listLinkedAccounts,
  listRecurringItems,
  listReviewGroups,
  listRules,
  listSavingsGoals,
  listTransactions,
  detectRecurringItems,
  getLocalUser,
  isEncryptionKey,
  toBudgets,
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

/**
 * Converts a transaction row into the shape the aggregation functions want.
 *
 * A split transaction becomes one row per part, each with the category of
 * that part and the amount of that part. The parts add up to the whole, so
 * the totals stay the same and the categories become the truth.
 */
export function toDashboardTransactions(row: TransactionRow): DashboardTransaction[] {
  const base = {
    id: row.id,
    accountId: row.accountId,
    postedAt: row.postedAt,
    currency: row.currency,
    pending: row.pending,
    merchantId: row.merchantId,
    merchantName: row.merchantName,
  };

  if (row.splitLines.length > 0) {
    return row.splitLines.map((line) => ({
      ...base,
      amountMinor: line.amountMinor,
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      categoryKind: line.categoryKind,
    }));
  }

  return [
    {
      ...base,
      amountMinor: row.amountMinor,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      categoryKind: row.categoryKind ?? 'uncategorized',
    },
  ];
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
  const transactions = rows.flatMap(toDashboardTransactions);

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
  const transactions = rows.flatMap(toDashboardTransactions);

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
  const transactions = rows.flatMap(toDashboardTransactions);
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

  const liabilityIds = new Set(
    accounts.filter((account) => account.isLiability).map((account) => account.id),
  );
  const netWorth = netWorthSeries(
    balances.map((balance) => ({
      accountId: balance.accountId,
      asOf: balance.asOf,
      balanceMinor: balance.balanceMinor,
    })),
    {
      months: recentMonths(12),
      isLiability: (accountId) => liabilityIds.has(accountId),
    },
  );

  return {
    accounts: summaries,
    netWorthMinor: assetsMinor + liabilitiesMinor,
    assetsMinor,
    liabilitiesMinor,
    balances,
    netWorth,
  };
}

/** Data for the import screen. */
export async function getImportData() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const profiles = await listImportProfiles(db, userId);

  return {
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      institution: profile.institution,
      mapping: profile.mapping,
      accountName: profile.accountName,
      accountType: profile.accountType,
      currency: profile.currency,
    })),
  };
}

/** Data for the subscriptions and bills screen. */
export async function getSubscriptionsData() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  // The detector runs when the screen opens: a subscription that was missed
  // last week shows up now, and nothing is lost while it waits.
  await detectRecurringItems(db, userId);
  const items = await listRecurringItems(db, userId);

  const timeZone = getEnv().APP_TIMEZONE;
  const today = toPlainDate(new Date());
  const active = items.filter((item) => item.status !== 'dismissed');
  const totals = recurringTotals(
    active.map((item) => ({
      amountMinor: item.amountMinor,
      cadence: item.cadence,
    })),
  );
  const upcoming = upcomingRecurring(active, { from: today, days: 30 });

  return {
    today,
    timeZone,
    items,
    monthlyMinor: totals.monthlyMinor,
    annualMinor: totals.annualMinor,
    upcoming,
    detected: items.filter((item) => item.status === 'detected').length,
    confirmed: items.filter((item) => item.status === 'confirmed').length,
  };
}

/** Data for the budgets screen. */
export async function getBudgetsData(month = currentMonth()) {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const timeZone = getEnv().APP_TIMEZONE;
  const [rows, categories, allRows] = await Promise.all([
    listBudgets(db, userId),
    listCategories(db, userId),
    listDashboardTransactions(db, userId),
  ]);

  const transactions = allRows.flatMap(toDashboardTransactions);
  const status = budgetStatus(transactions, toBudgets(rows), { month, timeZone });

  return {
    month,
    timeZone,
    status,
    budgets: rows,
    categories: categories
      .filter((category) => category.kind === 'spending')
      .map((category) => ({ id: category.id, name: category.name })),
  };
}

/** Data for the connections screen. */
export async function getConnectionsData() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const connections = await listConnections(db, userId);
  const accounts = connections.length
    ? await Promise.all(
        connections.map((connection) => listLinkedAccounts(db, userId, connection.id)),
      )
    : [];

  return {
    connections: connections.map((connection, index) => ({
      id: connection.id,
      adapterId: connection.adapterId,
      name: connection.name,
      institution: connection.institution,
      status: connection.status,
      lastSyncedAt: connection.lastSyncedAt,
      lastError: connection.lastError,
      historyDays: connection.historyDays,
      accounts: accounts[index] ?? [],
    })),
    /** Whether the app can store a credential at all. */
    canConnect: isEncryptionKey(getEnv().ENCRYPTION_KEY),
  };
}

/** Data for the savings goals screen. */
export async function getGoalsData() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return null;

  const [goals, accounts] = await Promise.all([
    listSavingsGoals(db, userId),
    listAccounts(db, userId),
  ]);
  const today = toPlainDate(new Date());

  return {
    today,
    goals: goals.map((goal) => toGoalView(goal, today)),
    accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
  };
}

/**
 * A goal as the screen sees it, with the progress worked out.
 *
 * The page and the API build the same shape, so a screen that reloads shows
 * the same thing as the one the server rendered.
 */
export function toGoalView(
  goal: {
    id: string;
    name: string;
    targetMinor: number;
    savedMinor: number;
    accountId: string | null;
    accountName: string | null;
    deadline: string | null;
    accountBalanceMinor: number | null;
  },
  today: string,
) {
  const progress = goalProgress(goal, { today, accountBalanceMinor: goal.accountBalanceMinor });
  return {
    id: goal.id,
    name: goal.name,
    targetMinor: goal.targetMinor,
    savedMinor: progress.savedMinor,
    accountId: goal.accountId,
    accountName: goal.accountName,
    deadline: goal.deadline,
    percentComplete: progress.percentComplete,
    remainingMinor: progress.remainingMinor,
    reached: progress.reached,
    daysLeft: progress.daysLeft,
    neededPerMonthMinor: progress.neededPerMonthMinor,
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
      .filter(
        (category) =>
          category.kind === 'spending' ||
          category.kind === 'income' ||
          category.kind === 'transfer',
      )
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
