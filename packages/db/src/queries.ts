/**
 * Read queries.
 *
 * Every query is scoped by `user_id`, even in single-user mode, so adding
 * accounts later does not become a rewrite. All input is parameterized.
 */

import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';

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

  return rows;
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

  return rows;
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
