/**
 * The transfers service.
 *
 * Money that moves between the user's own accounts is not spending. This
 * service finds those transfers, links the two sides, and keeps them out of
 * the totals. The user can always overrule it by hand.
 *
 * The matching itself is a pure function in `@moneytracker/core`; this is the
 * part that reads and writes the database.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  categorize,
  detectTransfers,
  SUSPECTED_TRANSFER_CONFIDENCE,
  TRANSFER_CONFIDENCE,
  type TransferCandidate,
} from '@moneytracker/core';

import { loadCategorizationState } from './categorization-state.ts';
import type { Database } from './client.ts';
import {
  accounts,
  categories,
  categoryAssignments,
  transactions as transactionsTable,
  transferGroups,
} from './schema.ts';
import { clearTransactionSplit } from './splits.ts';

/** What one detection run did. */
export interface TransferDetectionResult {
  /** Transfer groups that were created. */
  groupsCreated: number;
  /** Transactions that were linked into a group. */
  transactionsLinked: number;
  /** Transactions that look like transfers but found no other side. */
  suspected: number;
}

/** A transfer group as it is stored. */
export interface TransferGroupRow {
  id: string;
  kind: string;
  source: string;
  reason: string | null;
  memberCount: number;
  amountMinor: number;
}

/**
 * Finds the transfers among the user's transactions and links the two sides.
 *
 * Transactions that are already part of a group are left alone: a decision the
 * user made is never overwritten. Manual edits keep their category too.
 *
 * @example
 * const result = await detectAndApplyTransfers(db, userId);
 * result.transactionsLinked; // 24
 */
export async function detectAndApplyTransfers(
  db: Database,
  userId: string,
  options: { windowDays?: number } = {},
): Promise<TransferDetectionResult> {
  const result: TransferDetectionResult = {
    groupsCreated: 0,
    transactionsLinked: 0,
    suspected: 0,
  };

  const transferCategoryId = await findTransferCategoryId(db, userId);
  if (!transferCategoryId) return result;

  const rows = await db
    .select({
      id: transactionsTable.id,
      accountId: transactionsTable.accountId,
      accountName: accounts.name,
      accountType: accounts.type,
      postedAt: transactionsTable.postedAt,
      amountMinor: transactionsTable.amountMinor,
      descriptionRaw: transactionsTable.descriptionRaw,
    })
    .from(transactionsTable)
    .innerJoin(accounts, eq(accounts.id, transactionsTable.accountId))
    .where(
      and(
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.pending, false),
        isNull(transactionsTable.transferGroupId),
      ),
    );

  const candidates: TransferCandidate[] = rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    accountType: row.accountType,
    postedAt: row.postedAt,
    amountMinor: row.amountMinor,
    descriptionRaw: row.descriptionRaw,
  }));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const { pairs, suspected } = detectTransfers(candidates, {
    ...(options.windowDays !== undefined ? { windowDays: options.windowDays } : {}),
  });

  // Transactions that already belong to a group cannot take part in another
  // pairing.
  const grouped = new Set<string>();

  for (const pair of pairs) {
    const debit = byId.get(pair.debitId);
    const credit = byId.get(pair.creditId);
    if (!debit || !credit) continue;

    const [group] = await db
      .insert(transferGroups)
      .values({
        userId,
        kind: pair.kind,
        source: 'detected',
        reason: `Matched "${credit.descriptionRaw}" on ${credit.accountName}`,
      })
      .returning({ id: transferGroups.id });
    if (!group) continue;

    await db
      .update(transactionsTable)
      .set({ transferGroupId: group.id, updatedAt: new Date() })
      .where(inArray(transactionsTable.id, [pair.debitId, pair.creditId]));

    await writeTransferAssignment(db, {
      userId,
      transactionId: pair.debitId,
      categoryId: transferCategoryId,
      confidence: TRANSFER_CONFIDENCE,
      reason: `Transfer: matched "${credit.descriptionRaw}" on ${credit.accountName}`,
    });
    await writeTransferAssignment(db, {
      userId,
      transactionId: pair.creditId,
      categoryId: transferCategoryId,
      confidence: TRANSFER_CONFIDENCE,
      reason: `Transfer: matched "${debit.descriptionRaw}" on ${debit.accountName}`,
    });

    result.groupsCreated += 1;
    result.transactionsLinked += 2;
    grouped.add(pair.debitId);
    grouped.add(pair.creditId);
  }

  // A transaction that reads like a payment but found no partner is suspected.
  // It keeps the transfer category, so it is never counted as spending, and
  // its low confidence sends it to the review inbox.
  for (const suspect of suspected) {
    const [group] = await db
      .insert(transferGroups)
      .values({
        userId,
        kind: 'internal',
        source: 'suspected',
        reason: suspect.reason,
      })
      .returning({ id: transferGroups.id });
    if (!group) continue;

    await db
      .update(transactionsTable)
      .set({ transferGroupId: group.id, updatedAt: new Date() })
      .where(eq(transactionsTable.id, suspect.transactionId));

    await writeTransferAssignment(db, {
      userId,
      transactionId: suspect.transactionId,
      categoryId: transferCategoryId,
      confidence: SUSPECTED_TRANSFER_CONFIDENCE,
      reason: suspect.reason,
    });

    result.groupsCreated += 1;
    result.transactionsLinked += 1;
    result.suspected += 1;
    grouped.add(suspect.transactionId);
  }

  const linked = await linkUserMarkedTransfers(db, {
    userId,
    candidates,
    grouped,
    transferCategoryId,
  });
  result.transactionsLinked += linked;

  return result;
}

/**
 * Marks a transaction as a transfer by hand.
 *
 * The decision is locked: no later rule or detection run takes it away.
 *
 * @example
 * await markAsTransfer(db, userId, transactionId);
 */
export async function markAsTransfer(
  db: Database,
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const transferCategoryId = await findTransferCategoryId(db, userId);
  if (!transferCategoryId) return false;

  const existing = await db
    .select({ id: transactionsTable.id, transferGroupId: transactionsTable.transferGroupId })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, transactionId), eq(transactionsTable.userId, userId)));
  const transaction = existing[0];
  if (!transaction || transaction.transferGroupId) return false;

  // Saying "this is a transfer" ends a split: money that moves between your
  // own accounts is not spending, so it has no parts.
  await clearTransactionSplit(db, userId, transactionId);
  await db
    .update(categoryAssignments)
    .set({ locked: false, updatedAt: new Date() })
    .where(
      and(
        eq(categoryAssignments.userId, userId),
        eq(categoryAssignments.transactionId, transactionId),
      ),
    );

  const [group] = await db
    .insert(transferGroups)
    .values({
      userId,
      kind: 'user',
      source: 'user',
      reason: 'Marked as a transfer by you',
    })
    .returning({ id: transferGroups.id });
  if (!group) return false;

  await db
    .update(transactionsTable)
    .set({ transferGroupId: group.id, updatedAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));

  await writeTransferAssignment(db, {
    userId,
    transactionId,
    categoryId: transferCategoryId,
    confidence: 1,
    reason: 'Marked as a transfer by you',
    source: 'user_manual',
    locked: true,
  });

  return true;
}

/**
 * Confirms that a transaction is a transfer.
 *
 * A suspected transfer becomes a confirmed one, and a transaction that was
 * not part of any group gets one of its own.
 */
export async function confirmTransferGroup(
  db: Database,
  userId: string,
  transactionId: string,
): Promise<void> {
  const rows = await db
    .select({ transferGroupId: transactionsTable.transferGroupId })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, transactionId), eq(transactionsTable.userId, userId)));
  const groupId = rows[0]?.transferGroupId;

  if (!groupId) {
    await markAsTransfer(db, userId, transactionId);
    return;
  }

  // A suspected transfer becomes confirmed once the user says so.
  await db
    .update(transferGroups)
    .set({ source: 'detected', kind: 'internal' })
    .where(and(eq(transferGroups.id, groupId), eq(transferGroups.source, 'suspected')));
}

/**
 * Takes a transaction out of its transfer group and categorizes it again.
 *
 * @example
 * await unmarkTransfer(db, userId, transactionId);
 */
export async function unmarkTransfer(
  db: Database,
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const detached = await detachFromTransferGroup(db, userId, transactionId);
  if (!detached) return false;

  // The old assignment goes first: while it is locked it would still be part
  // of the merchant memory, and the pipeline would put the transfer category
  // straight back.
  await db
    .delete(categoryAssignments)
    .where(
      and(
        eq(categoryAssignments.transactionId, transactionId),
        eq(categoryAssignments.userId, userId),
      ),
    );

  await recategorizeOne(db, userId, transactionId);
  return true;
}

/**
 * Takes a transaction out of its transfer group without deciding anything
 * else. The caller writes the category that comes next.
 */
export async function detachFromTransferGroup(
  db: Database,
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const rows = await db
    .select({ transferGroupId: transactionsTable.transferGroupId })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, transactionId), eq(transactionsTable.userId, userId)));
  const groupId = rows[0]?.transferGroupId;
  if (!groupId) return false;

  await db
    .update(transactionsTable)
    .set({ transferGroupId: null, updatedAt: new Date() })
    .where(eq(transactionsTable.id, transactionId));

  const remaining = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(eq(transactionsTable.transferGroupId, groupId));
  if (remaining.length === 0) {
    await db.delete(transferGroups).where(eq(transferGroups.id, groupId));
  }

  return true;
}

/**
 * Takes several transactions out of their transfer groups at once.
 *
 * @example
 * await detachManyFromTransferGroups(db, userId, [id1, id2]);
 */
export async function detachManyFromTransferGroups(
  db: Database,
  userId: string,
  transactionIds: readonly string[],
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const rows = await db
    .select({ id: transactionsTable.id, transferGroupId: transactionsTable.transferGroupId })
    .from(transactionsTable)
    .where(
      and(eq(transactionsTable.userId, userId), inArray(transactionsTable.id, [...transactionIds])),
    );

  const groupIds = [
    ...new Set(rows.map((row) => row.transferGroupId).filter((id): id is string => Boolean(id))),
  ];
  if (groupIds.length === 0) return 0;

  await db
    .update(transactionsTable)
    .set({ transferGroupId: null, updatedAt: new Date() })
    .where(
      and(eq(transactionsTable.userId, userId), inArray(transactionsTable.id, [...transactionIds])),
    );

  const remaining = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(inArray(transactionsTable.transferGroupId, groupIds));
  const stillUsed = new Set(remaining.map((row) => row.id));
  const empty = groupIds.filter((id) => !stillUsed.has(id));
  if (empty.length > 0) {
    await db.delete(transferGroups).where(inArray(transferGroups.id, empty));
  }

  return rows.length;
}

/**
 * Lists the user's transfer groups, newest first.
 *
 * @example
 * const groups = await listTransferGroups(db, userId);
 * groups[0].memberCount; // 2
 */
export async function listTransferGroups(
  db: Database,
  userId: string,
): Promise<TransferGroupRow[]> {
  const rows = await db
    .select({
      id: transferGroups.id,
      kind: transferGroups.kind,
      source: transferGroups.source,
      reason: transferGroups.reason,
      createdAt: transferGroups.createdAt,
    })
    .from(transferGroups)
    .where(eq(transferGroups.userId, userId))
    .orderBy(sql`${transferGroups.createdAt} desc`);

  const members = await db
    .select({
      groupId: transactionsTable.transferGroupId,
      amountMinor: transactionsTable.amountMinor,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId));

  const byGroup = new Map<string, { count: number; amount: number }>();
  for (const member of members) {
    if (!member.groupId) continue;
    const entry = byGroup.get(member.groupId) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += Math.abs(member.amountMinor);
    byGroup.set(member.groupId, entry);
  }

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    source: row.source,
    reason: row.reason,
    memberCount: byGroup.get(row.id)?.count ?? 0,
    amountMinor: byGroup.get(row.id)?.amount ?? 0,
  }));
}

/**
 * Links a transaction to a group the user marked by hand.
 *
 * The user marks one side of a transfer; the matcher then finds the other
 * side and joins it to the same group.
 */
async function linkUserMarkedTransfers(
  db: Database,
  options: {
    userId: string;
    candidates: readonly TransferCandidate[];
    /** Transactions that already belong to a group. */
    grouped: ReadonlySet<string>;
    transferCategoryId: string;
  },
): Promise<number> {
  const { userId, candidates, grouped, transferCategoryId } = options;

  const groups = await db
    .select({ id: transferGroups.id })
    .from(transferGroups)
    .where(and(eq(transferGroups.userId, userId), eq(transferGroups.source, 'user')));

  let linked = 0;

  for (const group of groups) {
    const members = await db
      .select({
        id: transactionsTable.id,
        accountId: transactionsTable.accountId,
        postedAt: transactionsTable.postedAt,
        amountMinor: transactionsTable.amountMinor,
        descriptionRaw: transactionsTable.descriptionRaw,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.transferGroupId, group.id));

    if (members.length !== 1) continue;
    const member = members[0];
    const memberPostedAt = member?.postedAt;
    if (!member || !memberPostedAt) continue;

    const partner = candidates.find((candidate) => {
      if (grouped.has(candidate.id)) return false;
      if (candidate.accountId === member.accountId) return false;
      if (candidate.amountMinor !== -member.amountMinor) return false;
      if (!candidate.postedAt) return false;
      const days = Math.round(
        Math.abs(candidate.postedAt.getTime() - memberPostedAt.getTime()) / 86_400_000,
      );
      return days <= 3;
    });
    if (!partner) continue;

    await db
      .update(transactionsTable)
      .set({ transferGroupId: group.id, updatedAt: new Date() })
      .where(eq(transactionsTable.id, partner.id));

    await writeTransferAssignment(db, {
      userId,
      transactionId: partner.id,
      categoryId: transferCategoryId,
      confidence: TRANSFER_CONFIDENCE,
      reason: `Transfer: matched "${member.descriptionRaw}"`,
    });

    linked += 1;
  }

  return linked;
}

/**
 * Categorizes one transaction again, the way the pipeline would.
 *
 * Used when a transaction leaves a transfer group: it needs a fresh category,
 * and the rules and merchant memory decide which one.
 */
async function recategorizeOne(db: Database, userId: string, transactionId: string): Promise<void> {
  const state = await loadCategorizationState(db, userId);
  const transaction = state.transactions.find((item) => item.id === transactionId);
  if (!transaction) return;

  const outcome = categorize(
    {
      externalId: transaction.externalId,
      accountId: transaction.accountId,
      postedAt: transaction.postedAt,
      pending: transaction.pending,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      descriptionRaw: transaction.descriptionRaw,
      ...(transaction.merchantDisplayName ? { merchantRaw: transaction.merchantDisplayName } : {}),
      ...(transaction.sourceCategory ? { sourceCategory: transaction.sourceCategory } : {}),
    },
    state.context,
  );

  await db
    .insert(categoryAssignments)
    .values({
      transactionId,
      userId,
      categoryId: outcome.categoryId,
      source: outcome.source,
      confidence: outcome.confidence,
      reason: outcome.reason,
      locked: false,
    })
    .onConflictDoUpdate({
      target: categoryAssignments.transactionId,
      set: {
        categoryId: outcome.categoryId,
        source: outcome.source,
        confidence: outcome.confidence,
        reason: outcome.reason,
        locked: false,
        updatedAt: new Date(),
      },
    });
}

/**
 * Writes the assignment of a transaction that is known to be a transfer.
 *
 * A manual edit is never overwritten.
 */
async function writeTransferAssignment(
  db: Database,
  options: {
    userId: string;
    transactionId: string;
    categoryId: string;
    confidence: number;
    reason: string;
    source?: 'transfer_detection' | 'user_manual';
    locked?: boolean;
  },
): Promise<void> {
  const { userId, transactionId, categoryId, confidence, reason } = options;
  const source = options.source ?? 'transfer_detection';
  const locked = options.locked ?? false;

  const existing = await db
    .select({ locked: categoryAssignments.locked })
    .from(categoryAssignments)
    .where(eq(categoryAssignments.transactionId, transactionId));
  if (existing[0]?.locked) return;

  await db
    .insert(categoryAssignments)
    .values({ transactionId, userId, categoryId, source, confidence, reason, locked })
    .onConflictDoUpdate({
      target: categoryAssignments.transactionId,
      set: {
        categoryId,
        source,
        confidence,
        reason,
        ...(locked ? { locked: true } : {}),
        updatedAt: new Date(),
      },
    });
}

/**
 * The category that means "money moved between the user's own accounts".
 */
async function findTransferCategoryId(db: Database, userId: string): Promise<string | null> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.kind, 'transfer')))
    .limit(1);

  return rows[0]?.id ?? null;
}
