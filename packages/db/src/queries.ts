/**
 * Read queries.
 *
 * Every query is scoped by `user_id`, even in single-user mode, so adding
 * accounts later does not become a rewrite. All input is parameterized.
 */

import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { plainDateInMonth } from '@moneytracker/core';

import type { Database } from './client.ts';
import { getEnv } from './env.ts';
import {
  accounts,
  balanceSnapshots,
  categories,
  categoryAssignments,
  merchants,
  transactions,
  transferGroups,
  users,
} from './schema.ts';
import { listSplitsByTransaction, type SplitLine } from './splits.ts';

/**
 * The categories table a second time, to read the parent of a category.
 */
const parentCategories = alias(categories, 'parent_categories');

/** Filters accepted by the transaction list. */
export interface TransactionFilters {
  /** Free text over the description and the merchant name. */
  search?: string;
  accountId?: string;
  categoryId?: string;
  /** Inclusive plain dates, YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** Inclusive amount bounds in minor units. */
  minAmountMinor?: number;
  maxAmountMinor?: number;
  pending?: boolean;
  limit?: number;
  offset?: number;
}

/** A transaction joined with its merchant and category assignment. */
export interface TransactionRow {
  id: string;
  accountId: string;
  accountName: string;
  externalId: string;
  postedAt: Date | null;
  postedDate: string | null;
  pending: boolean;
  amountMinor: number;
  currency: string;
  descriptionRaw: string;
  merchantId: string | null;
  merchantName: string | null;
  /** The lowercased merchant key, used when writing a rule. */
  merchantKey: string | null;
  sourceCategory: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: 'spending' | 'income' | 'transfer' | 'uncategorized' | null;
  assignmentSource:
    | 'user_manual'
    | 'user_rule'
    | 'merchant_memory'
    | 'bank'
    | 'ai'
    | 'transfer_detection'
    | 'fallback'
    | null;
  confidence: number | null;
  reason: string | null;
  locked: boolean | null;
  /** The transfer group the transaction belongs to, if any. */
  transferGroupId: string | null;
  /** How the transfer was decided: 'detected', 'suspected' or 'user'. */
  transferSource: string | null;
  /**
   * The parts of the split, when the transaction is split.
   *
   * An empty list means the transaction is not split.
   */
  splitLines: SplitLine[];
}

/**
 * Returns the single local user.
 *
 * Phase 6 replaces this with a real session; the rest of the app already
 * works in terms of `user_id`.
 */
export async function getLocalUser(db: Database) {
  const rows = await db.select().from(users).limit(1);
  return rows[0] ?? null;
}

/** Lists the user's accounts with their latest balance. */
export async function listAccounts(db: Database, userId: string) {
  const accountRows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      currency: accounts.currency,
      mask: accounts.mask,
      isLiability: accounts.isLiability,
      adapterId: accounts.adapterId,
    })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.name));

  // The latest snapshot per account. Computed here rather than in SQL so the
  // account id is never rendered unqualified inside a subquery.
  const snapshots = await db
    .select({
      accountId: balanceSnapshots.accountId,
      asOf: balanceSnapshots.asOf,
      balanceMinor: balanceSnapshots.balanceMinor,
    })
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.userId, userId))
    .orderBy(desc(balanceSnapshots.asOf));

  const latestByAccount = new Map<string, { asOf: Date; balanceMinor: number }>();
  for (const snapshot of snapshots) {
    if (!latestByAccount.has(snapshot.accountId)) {
      latestByAccount.set(snapshot.accountId, {
        asOf: snapshot.asOf,
        balanceMinor: snapshot.balanceMinor,
      });
    }
  }

  return accountRows.map((account) => {
    const latest = latestByAccount.get(account.id);
    return {
      ...account,
      latestBalanceMinor: latest?.balanceMinor ?? null,
      latestBalanceAt: latest?.asOf ?? null,
    };
  });
}

/** Lists the user's categories. */
export async function listCategories(db: Database, userId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));
}

/** Lists balance snapshots over time, newest last. */
export async function listBalances(db: Database, userId: string) {
  return db
    .select({
      accountId: balanceSnapshots.accountId,
      asOf: balanceSnapshots.asOf,
      balanceMinor: balanceSnapshots.balanceMinor,
      currency: balanceSnapshots.currency,
    })
    .from(balanceSnapshots)
    .where(eq(balanceSnapshots.userId, userId))
    .orderBy(asc(balanceSnapshots.asOf));
}

/** Builds the WHERE clause for the transaction list. */
function transactionConditions(userId: string, filters: TransactionFilters) {
  const conditions = [eq(transactions.userId, userId)];

  if (filters.accountId) conditions.push(eq(transactions.accountId, filters.accountId));
  if (filters.from) conditions.push(gte(transactions.postedDate, filters.from));
  if (filters.to) conditions.push(lte(transactions.postedDate, filters.to));
  if (filters.pending !== undefined) conditions.push(eq(transactions.pending, filters.pending));
  if (filters.minAmountMinor !== undefined) {
    conditions.push(gte(transactions.amountMinor, filters.minAmountMinor));
  }
  if (filters.maxAmountMinor !== undefined) {
    conditions.push(lte(transactions.amountMinor, filters.maxAmountMinor));
  }
  if (filters.categoryId) {
    conditions.push(
      sql`exists (
        select 1 from category_assignments ca
        where ca.transaction_id = ${transactions.id}
          and ca.category_id = ${filters.categoryId}
      )`,
    );
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(ilike(transactions.descriptionRaw, pattern), ilike(merchants.displayName, pattern))!,
    );
  }

  return and(...conditions);
}

/** Lists transactions with their merchant and category assignment. */
export async function listTransactions(
  db: Database,
  userId: string,
  filters: TransactionFilters = {},
): Promise<TransactionRow[]> {
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      accountName: accounts.name,
      externalId: transactions.externalId,
      postedAt: transactions.postedAt,
      postedDate: transactions.postedDate,
      pending: transactions.pending,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      descriptionRaw: transactions.descriptionRaw,
      merchantId: transactions.merchantId,
      merchantName: merchants.displayName,
      merchantKey: merchants.key,
      sourceCategory: transactions.sourceCategory,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryKind: categories.kind,
      assignmentSource: categoryAssignments.source,
      confidence: categoryAssignments.confidence,
      reason: categoryAssignments.reason,
      locked: categoryAssignments.locked,
      transferGroupId: transactions.transferGroupId,
      transferSource: transferGroups.source,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .leftJoin(categoryAssignments, eq(categoryAssignments.transactionId, transactions.id))
    .leftJoin(categories, eq(categories.id, categoryAssignments.categoryId))
    .leftJoin(transferGroups, eq(transferGroups.id, transactions.transferGroupId))
    .where(transactionConditions(userId, filters))
    .orderBy(desc(transactions.postedAt), desc(transactions.createdAt))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  // A split transaction carries its parts with it, so the list can show them
  // and the dashboards can count them.
  const splitsByTransaction = await listSplitsByTransaction(
    db,
    userId,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    splitLines: splitsByTransaction.get(row.id) ?? [],
  }));
}

/** Counts the transactions matching the filters. */
export async function countTransactions(
  db: Database,
  userId: string,
  filters: TransactionFilters = {},
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(transactionConditions(userId, filters));

  return rows[0]?.value ?? 0;
}

/**
 * Returns the transactions the dashboards need.
 *
 * Aggregation happens in `core`, never in the UI.
 */
export async function listDashboardTransactions(
  db: Database,
  userId: string,
  options: { from?: string; to?: string } = {},
): Promise<TransactionRow[]> {
  return listTransactions(db, userId, {
    from: options.from,
    to: options.to,
    limit: 100_000,
  });
}

/** Counts the transactions that need review. */
export async function countNeedsReview(db: Database, userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(categoryAssignments)
    .innerJoin(transactions, eq(transactions.id, categoryAssignments.transactionId))
    .where(
      and(
        eq(categoryAssignments.userId, userId),
        eq(categoryAssignments.locked, false),
        sql`${categoryAssignments.confidence} < ${getEnv().REVIEW_CONFIDENCE_THRESHOLD}`,
      ),
    );

  return rows[0]?.value ?? 0;
}

/** Lists the transactions in the review inbox. */
export async function listNeedsReview(
  db: Database,
  userId: string,
  limit = 50,
): Promise<TransactionRow[]> {
  const rows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      accountName: accounts.name,
      externalId: transactions.externalId,
      postedAt: transactions.postedAt,
      postedDate: transactions.postedDate,
      pending: transactions.pending,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      descriptionRaw: transactions.descriptionRaw,
      merchantId: transactions.merchantId,
      merchantName: merchants.displayName,
      merchantKey: merchants.key,
      sourceCategory: transactions.sourceCategory,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryKind: categories.kind,
      assignmentSource: categoryAssignments.source,
      confidence: categoryAssignments.confidence,
      reason: categoryAssignments.reason,
      locked: categoryAssignments.locked,
      transferGroupId: transactions.transferGroupId,
      transferSource: transferGroups.source,
    })
    .from(categoryAssignments)
    .innerJoin(transactions, eq(transactions.id, categoryAssignments.transactionId))
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .leftJoin(categories, eq(categories.id, categoryAssignments.categoryId))
    .leftJoin(transferGroups, eq(transferGroups.id, transactions.transferGroupId))
    .where(
      and(
        eq(categoryAssignments.userId, userId),
        eq(categoryAssignments.locked, false),
        sql`${categoryAssignments.confidence} < ${getEnv().REVIEW_CONFIDENCE_THRESHOLD}`,
      ),
    )
    .orderBy(desc(transactions.postedAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, splitLines: [] }));
}

/** Lists the merchants the user has seen, most used first. */
export async function listMerchants(db: Database, userId: string, limit = 200) {
  const merchantRows = await db
    .select({
      id: merchants.id,
      displayName: merchants.displayName,
      key: merchants.key,
    })
    .from(merchants)
    .where(eq(merchants.userId, userId));

  const transactionRows = await db
    .select({ merchantId: transactions.merchantId })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  const countByMerchant = new Map<string, number>();
  for (const row of transactionRows) {
    if (!row.merchantId) continue;
    countByMerchant.set(row.merchantId, (countByMerchant.get(row.merchantId) ?? 0) + 1);
  }

  return merchantRows
    .map((merchant) => ({
      ...merchant,
      transactionCount: countByMerchant.get(merchant.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.transactionCount - a.transactionCount || a.displayName.localeCompare(b.displayName),
    )
    .slice(0, limit);
}

/** Lists the accounts referenced by the given ids. */
export async function listAccountsByIds(db: Database, userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), inArray(accounts.id, ids)));
}

/** One category of a month, with the group it belongs to. */
export interface CategorySpendRow {
  /** The group the category belongs to. A top level category is its own group. */
  groupId: string;
  /** The name of the group. */
  groupName: string;
  /** The colour of the group, when it has one. */
  groupColor: string | null;
  /** The category itself. */
  categoryId: string;
  /** The name of the category. */
  categoryName: string;
  /** Signed amount in minor units: negative means money out. */
  amountMinor: number;
}

/**
 * What was spent in a month, by group and by category.
 *
 * The group of a category is its parent, or the category itself when it has
 * no parent. Transfers and income are left out: they are not spending.
 *
 * @example
 * const rows = await getCategorySpendByMonth(db, userId, { month: '2026-10' });
 */
export async function getCategorySpendByMonth(
  db: Database,
  userId: string,
  options: { month: string },
): Promise<CategorySpendRow[]> {
  const from = plainDateInMonth(options.month, 1);
  const to = plainDateInMonth(options.month, 31);

  const rows = await db
    .select({
      groupId: sql<string>`coalesce(${categories.parentId}, ${categories.id})`,
      groupName: sql<string>`coalesce(${parentCategories.name}, ${categories.name})`,
      groupColor: sql<string | null>`coalesce(${parentCategories.color}, ${categories.color})`,
      categoryId: categories.id,
      categoryName: categories.name,
      // Postgres sums of bigint come back as a string; the app works in
      // numbers, so the sum is read as one here.
      amountMinor: sql<string>`sum(${transactions.amountMinor})`,
    })
    .from(transactions)
    .innerJoin(categoryAssignments, eq(categoryAssignments.transactionId, transactions.id))
    .innerJoin(categories, eq(categories.id, categoryAssignments.categoryId))
    .leftJoin(parentCategories, eq(parentCategories.id, categories.parentId))
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.postedDate, from),
        lte(transactions.postedDate, to),
        eq(transactions.pending, false),
        inArray(categories.kind, ['spending', 'uncategorized']),
      ),
    )
    .groupBy(
      sql`coalesce(${categories.parentId}, ${categories.id})`,
      sql`coalesce(${parentCategories.name}, ${categories.name})`,
      sql`coalesce(${parentCategories.color}, ${categories.color})`,
      categories.id,
      categories.name,
    )
    .orderBy(desc(sql`sum(${transactions.amountMinor})`));

  return rows.map((row) => ({
    groupId: row.groupId,
    groupName: row.groupName,
    groupColor: row.groupColor,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    amountMinor: Number(row.amountMinor),
  }));
}
