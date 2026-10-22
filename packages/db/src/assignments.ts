/**
 * The assignments service.
 *
 * A manual edit is locked: it is the user's decision, and nothing overwrites
 * it. Bulk edits lock every transaction they touch, and can be undone by
 * restoring the categories they had before.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { getEnv } from './env.ts';
import type { Database } from './client.ts';
import {
  accounts,
  categoryAssignments,
  categories,
  merchants,
  transactions as transactionsTable,
} from './schema.ts';
import {
  confirmTransferGroup,
  detachFromTransferGroup,
  detachManyFromTransferGroups,
} from './transfers.ts';

/** An assignment as it was, so an edit can be undone exactly. */
export interface PreviousAssignment {
  categoryId: string;
  source:
    | 'user_manual'
    | 'user_rule'
    | 'merchant_memory'
    | 'bank'
    | 'ai'
    | 'transfer_detection'
    | 'fallback';
  confidence: number;
  reason: string;
  locked: boolean;
}

/** A transaction in the review inbox. */
export interface ReviewTransaction {
  id: string;
  accountId: string;
  accountName: string;
  descriptionRaw: string;
  merchantName: string | null;
  merchantId: string | null;
  amountMinor: number;
  currency: string;
  postedDate: string | null;
  pending: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: 'spending' | 'income' | 'transfer' | 'uncategorized' | null;
  source:
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
}

/** Transactions of one merchant, grouped so one decision clears many. */
export interface ReviewGroup {
  /** The merchant key, or a synthetic key when the transaction has none. */
  key: string;
  merchantName: string;
  merchantId: string | null;
  transactions: ReviewTransaction[];
  /** The category most of the group already has. */
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  /** The total of the group, in minor units. */
  totalMinor: number;
}

/**
 * Sets a transaction's category by hand.
 *
 * The assignment is locked, so later re-categorization runs leave it alone.
 * Changing the category by hand also takes the transaction out of its transfer
 * group: deciding what something is means deciding it is not a transfer.
 *
 * @example
 * await setManualCategory(db, userId, transactionId, categoryId);
 */
export async function setManualCategory(
  db: Database,
  userId: string,
  transactionId: string,
  categoryId: string,
): Promise<boolean> {
  // Picking the transfer category means "this is a transfer", so the
  // transaction keeps its place in the transfer group. Any other category
  // means it is not, so it leaves the group.
  const [target] = await db
    .select({ kind: categories.kind })
    .from(categories)
    .where(eq(categories.id, categoryId));

  if (target?.kind === 'transfer') {
    await confirmTransferGroup(db, userId, transactionId);
  } else {
    await detachFromTransferGroup(db, userId, transactionId);
  }

  const rows = await db
    .insert(categoryAssignments)
    .values({
      transactionId,
      userId,
      categoryId,
      source: 'user_manual',
      confidence: 1,
      reason: 'Set by you',
      locked: true,
    })
    .onConflictDoUpdate({
      target: categoryAssignments.transactionId,
      set: {
        categoryId,
        source: 'user_manual',
        confidence: 1,
        reason: 'Set by you',
        locked: true,
        updatedAt: new Date(),
      },
    })
    .returning({ transactionId: categoryAssignments.transactionId });

  return rows.length > 0;
}

/**
 * Sets the category of several transactions at once.
 *
 * @example
 * const count = await bulkSetCategory(db, userId, [id1, id2], categoryId);
 */
export async function bulkSetCategory(
  db: Database,
  userId: string,
  transactionIds: readonly string[],
  categoryId: string,
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const [target] = await db
    .select({ kind: categories.kind })
    .from(categories)
    .where(eq(categories.id, categoryId));

  if (target?.kind === 'transfer') {
    for (const transactionId of transactionIds) {
      await confirmTransferGroup(db, userId, transactionId);
    }
  } else {
    await detachManyFromTransferGroups(db, userId, transactionIds);
  }

  const rows = await db
    .insert(categoryAssignments)
    .values(
      transactionIds.map((transactionId) => ({
        transactionId,
        userId,
        categoryId,
        source: 'user_manual' as const,
        confidence: 1,
        reason: 'Set by you',
        locked: true,
      })),
    )
    .onConflictDoUpdate({
      target: categoryAssignments.transactionId,
      set: {
        categoryId,
        source: 'user_manual',
        confidence: 1,
        reason: 'Set by you',
        locked: true,
        updatedAt: new Date(),
      },
    })
    .returning({ transactionId: categoryAssignments.transactionId });

  return rows.length;
}

/**
 * The assignment a set of transactions had, so an edit can be undone.
 *
 * @example
 * const before = await currentAssignments(db, userId, [id1, id2]);
 */
export async function currentAssignments(
  db: Database,
  userId: string,
  transactionIds: readonly string[],
): Promise<Array<{ transactionId: string; assignment: PreviousAssignment | null }>> {
  if (transactionIds.length === 0) return [];

  const rows = await db
    .select({
      transactionId: categoryAssignments.transactionId,
      categoryId: categoryAssignments.categoryId,
      source: categoryAssignments.source,
      confidence: categoryAssignments.confidence,
      reason: categoryAssignments.reason,
      locked: categoryAssignments.locked,
    })
    .from(categoryAssignments)
    .where(
      and(
        eq(categoryAssignments.userId, userId),
        inArray(categoryAssignments.transactionId, [...transactionIds]),
      ),
    );

  const known = new Map(
    rows.map((row) => [
      row.transactionId,
      {
        categoryId: row.categoryId,
        source: row.source,
        confidence: row.confidence,
        reason: row.reason,
        locked: row.locked,
      } satisfies PreviousAssignment,
    ]),
  );

  return transactionIds.map((transactionId) => ({
    transactionId,
    assignment: known.get(transactionId) ?? null,
  }));
}

/**
 * Puts a bulk edit back the way it was, source and lock included.
 *
 * This is what the "undo" button calls.
 *
 * @example
 * await undoBulkSetCategory(db, userId, [{ transactionId, assignment }]);
 */
export async function undoBulkSetCategory(
  db: Database,
  userId: string,
  previous: ReadonlyArray<{ transactionId: string; assignment: PreviousAssignment | null }>,
): Promise<number> {
  let restored = 0;

  for (const entry of previous) {
    if (!entry.assignment) {
      await db
        .delete(categoryAssignments)
        .where(
          and(
            eq(categoryAssignments.transactionId, entry.transactionId),
            eq(categoryAssignments.userId, userId),
          ),
        );
      restored += 1;
      continue;
    }

    await db
      .update(categoryAssignments)
      .set({
        categoryId: entry.assignment.categoryId,
        source: entry.assignment.source,
        confidence: entry.assignment.confidence,
        reason: entry.assignment.reason,
        locked: entry.assignment.locked,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(categoryAssignments.transactionId, entry.transactionId),
          eq(categoryAssignments.userId, userId),
        ),
      );
    restored += 1;
  }

  // A transaction that is no longer a transfer leaves its transfer group, so
  // the badge and the category always agree.
  const restoredCategoryIds = [
    ...new Set(
      previous
        .map((entry) => entry.assignment?.categoryId)
        .filter((categoryId): categoryId is string => Boolean(categoryId)),
    ),
  ];

  if (restoredCategoryIds.length > 0) {
    const kinds = await db
      .select({ id: categories.id, kind: categories.kind })
      .from(categories)
      .where(inArray(categories.id, restoredCategoryIds));
    const transferCategoryIds = new Set(
      kinds.filter((row) => row.kind === 'transfer').map((row) => row.id),
    );

    const notTransfers = previous
      .filter((entry) => {
        const categoryId = entry.assignment?.categoryId;
        return categoryId ? !transferCategoryIds.has(categoryId) : true;
      })
      .map((entry) => entry.transactionId);

    await detachManyFromTransferGroups(db, userId, notTransfers);
  }

  return restored;
}

/**
 * Lists the transactions that need review: below the confidence threshold, or
 * with no category at all.
 *
 * @example
 * const items = await listReviewTransactions(db, userId, { limit: 100 });
 */
export async function listReviewTransactions(
  db: Database,
  userId: string,
  options: { limit?: number; threshold?: number } = {},
): Promise<ReviewTransaction[]> {
  const threshold = options.threshold ?? getEnv().REVIEW_CONFIDENCE_THRESHOLD;

  const rows = await db
    .select({
      id: transactionsTable.id,
      accountId: transactionsTable.accountId,
      accountName: accounts.name,
      descriptionRaw: transactionsTable.descriptionRaw,
      merchantName: merchants.displayName,
      merchantId: merchants.id,
      amountMinor: transactionsTable.amountMinor,
      currency: transactionsTable.currency,
      postedDate: transactionsTable.postedDate,
      pending: transactionsTable.pending,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryKind: categories.kind,
      source: categoryAssignments.source,
      confidence: categoryAssignments.confidence,
      reason: categoryAssignments.reason,
    })
    .from(categoryAssignments)
    .innerJoin(transactionsTable, eq(transactionsTable.id, categoryAssignments.transactionId))
    .innerJoin(accounts, eq(accounts.id, transactionsTable.accountId))
    .leftJoin(merchants, eq(merchants.id, transactionsTable.merchantId))
    .leftJoin(categories, eq(categories.id, categoryAssignments.categoryId))
    .where(
      and(
        eq(categoryAssignments.userId, userId),
        eq(categoryAssignments.locked, false),
        sql`${categoryAssignments.confidence} < ${threshold}`,
      ),
    )
    .orderBy(desc(transactionsTable.postedAt))
    .limit(options.limit ?? 200);

  return rows;
}

/**
 * Groups the review inbox by merchant, so one decision clears many
 * transactions at once.
 *
 * @example
 * const groups = await listReviewGroups(db, userId);
 * groups[0].transactions.length; // 14
 */
export async function listReviewGroups(
  db: Database,
  userId: string,
  options: { limit?: number; threshold?: number } = {},
): Promise<ReviewGroup[]> {
  const transactions = await listReviewTransactions(db, userId, options);

  const groups = new Map<string, ReviewGroup>();

  for (const transaction of transactions) {
    const key = transaction.merchantId ?? `raw:${transaction.descriptionRaw}`;
    let group = groups.get(key);

    if (!group) {
      group = {
        key,
        merchantName: transaction.merchantName ?? transaction.descriptionRaw,
        merchantId: transaction.merchantId,
        transactions: [],
        suggestedCategoryId: transaction.categoryId,
        suggestedCategoryName: transaction.categoryName,
        totalMinor: 0,
      };
      groups.set(key, group);
    }

    group.transactions.push(transaction);
    group.totalMinor += transaction.amountMinor;
  }

  // Suggest the category most of the group already has.
  for (const group of groups.values()) {
    const counts = new Map<string, { id: string; name: string | null; count: number }>();
    for (const transaction of group.transactions) {
      if (!transaction.categoryId) continue;
      const entry = counts.get(transaction.categoryId) ?? {
        id: transaction.categoryId,
        name: transaction.categoryName,
        count: 0,
      };
      entry.count += 1;
      counts.set(transaction.categoryId, entry);
    }

    const best = [...counts.values()].sort((a, b) => b.count - a.count)[0];
    if (best) {
      group.suggestedCategoryId = best.id;
      group.suggestedCategoryName = best.name;
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      b.transactions.length - a.transactions.length || a.merchantName.localeCompare(b.merchantName),
  );
}
