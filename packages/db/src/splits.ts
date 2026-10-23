/**
 * The split service.
 *
 * One charge can be more than one thing: a hotel bill that is also dinner, a
 * shop run that is groceries and household. A split says so without touching
 * the row the bank gave us: the transaction keeps its amount, its date and
 * its description, and the parts live next to it.
 *
 * The parts always add up to the whole. That is the one rule, and the app
 * will not let a split be saved when it does not.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { splitBalance } from '@moneytracker/core';

import type { Database } from './client.ts';
import { categories, categoryAssignments, splitLines, transactions } from './schema.ts';

/** One part of a split. */
export interface SplitLineInput {
  categoryId: string;
  /** Signed amount in minor units. The parts add up to the transaction. */
  amountMinor: number;
  note?: string | null;
}

/** A part of a split, as it is stored. */
export interface SplitLine {
  id: string;
  transactionId: string;
  categoryId: string;
  categoryName: string;
  categoryKind: 'spending' | 'income' | 'transfer' | 'uncategorized';
  amountMinor: number;
  note: string | null;
}

/** What a split did, or why it could not be done. */
export type SplitOutcome = { ok: true; lines: SplitLine[] } | { ok: false; reason: string };

/**
 * Lists the parts of a split.
 *
 * @example
 * const lines = await listTransactionSplits(db, userId, transactionId);
 */
export async function listTransactionSplits(
  db: Database,
  userId: string,
  transactionId: string,
): Promise<SplitLine[]> {
  const rows = await db
    .select({
      id: splitLines.id,
      transactionId: splitLines.transactionId,
      categoryId: splitLines.categoryId,
      categoryName: categories.name,
      categoryKind: categories.kind,
      amountMinor: splitLines.amountMinor,
      note: splitLines.note,
    })
    .from(splitLines)
    .innerJoin(categories, eq(categories.id, splitLines.categoryId))
    .where(and(eq(splitLines.userId, userId), eq(splitLines.transactionId, transactionId)))
    .orderBy(splitLines.createdAt);

  return rows;
}

/**
 * Lists the parts of many splits at once.
 *
 * The transaction list and the dashboards need the parts of every row they
 * show, and one query is enough for all of them.
 *
 * @example
 * const byTransaction = await listSplitsByTransaction(db, userId, transactionIds);
 */
export async function listSplitsByTransaction(
  db: Database,
  userId: string,
  transactionIds: readonly string[],
): Promise<Map<string, SplitLine[]>> {
  const byTransaction = new Map<string, SplitLine[]>();
  if (transactionIds.length === 0) return byTransaction;

  const rows = await db
    .select({
      id: splitLines.id,
      transactionId: splitLines.transactionId,
      categoryId: splitLines.categoryId,
      categoryName: categories.name,
      categoryKind: categories.kind,
      amountMinor: splitLines.amountMinor,
      note: splitLines.note,
    })
    .from(splitLines)
    .innerJoin(categories, eq(categories.id, splitLines.categoryId))
    .where(
      and(eq(splitLines.userId, userId), inArray(splitLines.transactionId, [...transactionIds])),
    );

  for (const row of rows) {
    const lines = byTransaction.get(row.transactionId) ?? [];
    lines.push(row);
    byTransaction.set(row.transactionId, lines);
  }

  return byTransaction;
}

/**
 * Splits a transaction across categories.
 *
 * The parts have to add up to the amount of the transaction. A transaction
 * that is part of a transfer cannot be split: money that moves between your
 * own accounts is not spending.
 *
 * @example
 * const outcome = await setTransactionSplit(db, userId, transactionId, [
 *   { categoryId: groceriesId, amountMinor: -6000 },
 *   { categoryId: gasId, amountMinor: -4000 },
 * ]);
 */
export async function setTransactionSplit(
  db: Database,
  userId: string,
  transactionId: string,
  lines: readonly SplitLineInput[],
): Promise<SplitOutcome> {
  const [transaction] = await db
    .select({
      id: transactions.id,
      amountMinor: transactions.amountMinor,
      transferGroupId: transactions.transferGroupId,
    })
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId)));

  if (!transaction) return { ok: false, reason: 'Transaction not found' };

  if (transaction.transferGroupId) {
    return { ok: false, reason: 'A transfer is not spending, so it cannot be split' };
  }

  if (lines.length < 2) {
    return { ok: false, reason: 'A split needs at least two parts' };
  }

  for (const line of lines) {
    if (!Number.isSafeInteger(line.amountMinor)) {
      return { ok: false, reason: 'Every part has to be a whole number of cents' };
    }
    if (line.amountMinor === 0) {
      return { ok: false, reason: 'A part cannot be zero' };
    }
  }

  const balance = splitBalance(lines, transaction.amountMinor);
  if (!balance.balanced) {
    return {
      ok: false,
      reason: `The parts add up to ${formatDifference(balance.differenceMinor)}, not to the whole`,
    };
  }

  const categoryIds = [...new Set(lines.map((line) => line.categoryId))];
  const known = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.userId, userId), inArray(categories.id, categoryIds)));

  const kindByCategory = new Map(known.map((row) => [row.id, row.kind]));
  for (const categoryId of categoryIds) {
    const kind = kindByCategory.get(categoryId);
    if (!kind) return { ok: false, reason: 'One of the categories is not yours' };
    if (kind === 'transfer') {
      return { ok: false, reason: 'A transfer is not a category to spend on' };
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(splitLines).where(eq(splitLines.transactionId, transactionId));

    for (const line of lines) {
      await tx.insert(splitLines).values({
        userId,
        transactionId,
        categoryId: line.categoryId,
        amountMinor: line.amountMinor,
        note: line.note ?? null,
      });
    }

    // The transaction itself is decided now, so no rule and no later import
    // may move it. The parts carry the categories from here on.
    await tx
      .insert(categoryAssignments)
      .values({
        transactionId,
        userId,
        categoryId: lines[0]!.categoryId,
        source: 'user_manual',
        confidence: 1,
        reason: `Split into ${lines.length} parts`,
        locked: true,
      })
      .onConflictDoUpdate({
        target: categoryAssignments.transactionId,
        set: {
          categoryId: lines[0]!.categoryId,
          source: 'user_manual',
          confidence: 1,
          reason: `Split into ${lines.length} parts`,
          locked: true,
          updatedAt: new Date(),
        },
      });
  });

  return { ok: true, lines: await listTransactionSplits(db, userId, transactionId) };
}

/**
 * Removes a split and leaves the transaction with one category again.
 *
 * @example
 * await clearTransactionSplit(db, userId, transactionId);
 */
export async function clearTransactionSplit(
  db: Database,
  userId: string,
  transactionId: string,
): Promise<boolean> {
  const rows = await db
    .delete(splitLines)
    .where(and(eq(splitLines.userId, userId), eq(splitLines.transactionId, transactionId)))
    .returning({ id: splitLines.id });

  if (rows.length === 0) return false;

  // The transaction goes back to the pipeline, which decides its category
  // again like it does for any other transaction.
  await db
    .update(categoryAssignments)
    .set({ locked: false, updatedAt: new Date() })
    .where(
      and(
        eq(categoryAssignments.userId, userId),
        eq(categoryAssignments.transactionId, transactionId),
      ),
    );

  return true;
}

/**
 * Removes every split of the user.
 *
 * @example
 * await removeSplits(db, userId);
 */
export async function removeSplits(db: Database, userId: string): Promise<void> {
  const rows = await db
    .select({ id: splitLines.transactionId })
    .from(splitLines)
    .where(eq(splitLines.userId, userId));

  if (rows.length === 0) return;

  const transactionIds = [...new Set(rows.map((row) => row.id))];

  await db.delete(splitLines).where(eq(splitLines.userId, userId));
  await db
    .update(categoryAssignments)
    .set({ locked: false, updatedAt: new Date() })
    .where(
      and(
        eq(categoryAssignments.userId, userId),
        inArray(categoryAssignments.transactionId, transactionIds),
      ),
    );
}

/** Says how far a split is off, in words. */
function formatDifference(differenceMinor: number): string {
  const cents = Math.abs(differenceMinor);
  const units = Math.floor(cents / 100);
  const rest = cents % 100;
  const amount = rest === 0 ? `${units}` : `${units}.${String(rest).padStart(2, '0')}`;
  return differenceMinor < 0 ? `${amount} short` : `${amount} over`;
}
