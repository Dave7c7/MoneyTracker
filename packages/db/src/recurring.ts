/**
 * The recurring charge service.
 *
 * A subscription or a bill is found in the transactions and then kept in its
 * own table, because the user's decision about it has to survive: a dismissed
 * item is never detected again, and a confirmed one is never overwritten.
 *
 * Detection is a pure function in `core`; this module runs it and stores what
 * it found.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  detectRecurring,
  type RecurringCadence,
  type RecurringCandidate,
  type RecurringItem,
  type RecurringStatus,
} from '@moneytracker/core';

import type { Database } from './client.ts';
import { accounts, categories, recurringItems } from './schema.ts';
import { listDashboardTransactions, type TransactionRow } from './queries.ts';

/** A recurring item, as it is stored. */
export interface RecurringItemRow {
  id: string;
  key: string;
  merchantKey: string | null;
  merchantName: string;
  descriptionRaw: string | null;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  cadence: RecurringCadence;
  status: RecurringStatus;
  amountMinor: number;
  currency: string;
  occurrences: number;
  firstDate: string | null;
  lastDate: string | null;
  nextDate: string;
  priceChanged: boolean;
  previousAmountMinor: number | null;
  confidence: number;
  reason: string | null;
  isManual: boolean;
}

/** A bill the user added by hand. */
export interface ManualRecurringInput {
  name: string;
  amountMinor: number;
  currency: string;
  cadence: RecurringCadence;
  /** The day the charge lands, for a monthly or annual bill. */
  nextDate: string;
  accountId?: string | null;
  categoryId?: string | null;
}

/** What one detection run did. */
export interface RecurringDetectionResult {
  /** How many items the detector found. */
  detected: number;
  /** How many were stored as new. */
  added: number;
  /** The items the user has to look at. */
  items: RecurringItemRow[];
}

/**
 * Lists the recurring items.
 *
 * Dismissed items are left out unless they are asked for: they are history,
 * not something to show.
 *
 * @example
 * const items = await listRecurringItems(db, userId);
 */
export async function listRecurringItems(
  db: Database,
  userId: string,
  options: { includeDismissed?: boolean } = {},
): Promise<RecurringItemRow[]> {
  const rows = await db
    .select({
      id: recurringItems.id,
      key: recurringItems.key,
      merchantKey: recurringItems.merchantKey,
      merchantName: recurringItems.merchantName,
      descriptionRaw: recurringItems.descriptionRaw,
      accountId: recurringItems.accountId,
      accountName: accounts.name,
      categoryId: recurringItems.categoryId,
      categoryName: categories.name,
      cadence: recurringItems.cadence,
      status: recurringItems.status,
      amountMinor: recurringItems.amountMinor,
      currency: recurringItems.currency,
      occurrences: recurringItems.occurrences,
      firstDate: recurringItems.firstDate,
      lastDate: recurringItems.lastDate,
      nextDate: recurringItems.nextDate,
      priceChanged: recurringItems.priceChanged,
      previousAmountMinor: recurringItems.previousAmountMinor,
      confidence: recurringItems.confidence,
      reason: recurringItems.reason,
      isManual: recurringItems.isManual,
    })
    .from(recurringItems)
    .leftJoin(accounts, eq(accounts.id, recurringItems.accountId))
    .leftJoin(categories, eq(categories.id, recurringItems.categoryId))
    .where(
      options.includeDismissed
        ? eq(recurringItems.userId, userId)
        : and(
            eq(recurringItems.userId, userId),
            inArray(recurringItems.status, ['detected', 'confirmed']),
          ),
    )
    .orderBy(asc(recurringItems.nextDate));

  return rows.map((row) => ({
    ...row,
    cadence: row.cadence as RecurringCadence,
    status: row.status as RecurringStatus,
  }));
}

/**
 * Looks for recurring charges and stores what it finds.
 *
 * The user's decisions are kept: a confirmed item is not overwritten, and a
 * dismissed item is not brought back.
 *
 * @example
 * const { added } = await detectRecurringItems(db, userId);
 */
export async function detectRecurringItems(
  db: Database,
  userId: string,
  options: { months?: number } = {},
): Promise<RecurringDetectionResult> {
  const months = options.months ?? 24;
  const rows = await listDashboardTransactions(db, userId);
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const candidates = rows
    .filter((row) => row.postedAt !== null && row.postedAt >= cutoff)
    .map(toRecurringCandidate);
  const found = detectRecurring(candidates);

  const existing = await listRecurringItems(db, userId, { includeDismissed: true });
  const byKey = new Map(existing.map((item) => [item.key, item]));

  let added = 0;
  for (const item of found) {
    const current = byKey.get(item.key);
    if (current && current.status !== 'detected') continue;

    if (!current) {
      await db.insert(recurringItems).values({
        userId,
        key: item.key,
        merchantKey: item.merchantKey,
        merchantName: item.merchantName,
        descriptionRaw: null,
        accountId: item.accountId,
        categoryId: item.categoryId,
        cadence: item.cadence,
        status: 'detected',
        amountMinor: item.amountMinor,
        currency: item.currency,
        occurrences: item.occurrences,
        firstDate: item.firstDate,
        lastDate: item.lastDate,
        nextDate: item.nextDate,
        priceChanged: item.priceChanged,
        previousAmountMinor: item.previousAmountMinor,
        confidence: item.confidence,
        reason: item.reason,
        isManual: false,
      });
      added += 1;
      continue;
    }

    // Nothing changed, so nothing is written. The screen opens often, and a
    // write on every open would fill the database with the same row.
    if (unchanged(current, item)) continue;

    await db
      .update(recurringItems)
      .set({
        amountMinor: item.amountMinor,
        occurrences: item.occurrences,
        firstDate: item.firstDate,
        lastDate: item.lastDate,
        nextDate: item.nextDate,
        priceChanged: item.priceChanged,
        previousAmountMinor: item.previousAmountMinor,
        confidence: item.confidence,
        reason: item.reason,
        updatedAt: new Date(),
      })
      .where(eq(recurringItems.id, current.id));
  }
  const items = await listRecurringItems(db, userId);
  return { detected: found.length, added, items };
}

/**
 * Confirms or dismisses a recurring item.
 *
 * @example
 * await setRecurringItemStatus(db, userId, id, 'confirmed');
 */
export async function setRecurringItemStatus(
  db: Database,
  userId: string,
  id: string,
  status: RecurringStatus,
): Promise<RecurringItemRow | null> {
  const rows = await db
    .update(recurringItems)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, userId)))
    .returning({ id: recurringItems.id });

  if (rows.length === 0) return null;
  const items = await listRecurringItems(db, userId, { includeDismissed: true });
  return items.find((item) => item.id === id) ?? null;
}

/**
 * Adds a bill the user knows about and the app has not found yet.
 *
 * @example
 * await createManualRecurringItem(db, userId, {
 *   name: 'Car insurance', amountMinor: 120_00, currency: 'USD',
 *   cadence: 'annual', nextDate: '2027-03-01',
 * });
 */
export async function createManualRecurringItem(
  db: Database,
  userId: string,
  input: ManualRecurringInput,
): Promise<RecurringItemRow> {
  const key = `manual:${input.name.trim().toLowerCase()}:${input.cadence}`;
  const rows = await db
    .insert(recurringItems)
    .values({
      userId,
      key,
      merchantKey: null,
      merchantName: input.name.trim(),
      descriptionRaw: input.name.trim(),
      accountId: input.accountId ?? null,
      categoryId: input.categoryId ?? null,
      cadence: input.cadence,
      status: 'confirmed',
      amountMinor: input.amountMinor,
      currency: input.currency,
      occurrences: 0,
      firstDate: null,
      lastDate: null,
      nextDate: input.nextDate,
      priceChanged: false,
      previousAmountMinor: null,
      confidence: 1,
      reason: 'Added by hand.',
      isManual: true,
    })
    .onConflictDoUpdate({
      target: [recurringItems.userId, recurringItems.key],
      set: {
        amountMinor: input.amountMinor,
        nextDate: input.nextDate,
        cadence: input.cadence,
        accountId: input.accountId ?? null,
        categoryId: input.categoryId ?? null,
        status: 'confirmed',
        updatedAt: new Date(),
      },
    })
    .returning({ id: recurringItems.id });

  const items = await listRecurringItems(db, userId, { includeDismissed: true });
  const created = items.find((item) => item.id === rows[0]?.id);
  if (!created) throw new Error('The recurring item could not be stored');
  return created;
}

/**
 * Removes a recurring item.
 *
 * @example
 * await deleteRecurringItem(db, userId, id);
 */
export async function deleteRecurringItem(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(recurringItems)
    .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, userId)))
    .returning({ id: recurringItems.id });
  return rows.length > 0;
}

/**
 * Removes every recurring item, so the database is the way it was found.
 *
 * @example
 * await removeRecurringItems(db, userId);
 */
export async function removeRecurringItems(db: Database, userId: string): Promise<void> {
  await db.delete(recurringItems).where(eq(recurringItems.userId, userId));
}

/** Whether the stored item already says everything the detector found. */
function unchanged(current: RecurringItemRow, found: RecurringItem): boolean {
  return (
    current.amountMinor === found.amountMinor &&
    current.occurrences === found.occurrences &&
    current.nextDate === found.nextDate &&
    current.lastDate === found.lastDate &&
    current.priceChanged === found.priceChanged &&
    current.previousAmountMinor === found.previousAmountMinor
  );
}

/**
 * Turns a transaction row into the shape the detector needs.
 */
function toRecurringCandidate(row: TransactionRow): RecurringCandidate {
  return {
    id: row.id,
    accountId: row.accountId,
    postedAt: row.postedAt,
    amountMinor: row.amountMinor,
    currency: row.currency,
    descriptionRaw: row.descriptionRaw,
    merchantKey: row.merchantKey,
    merchantName: row.merchantName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categoryKind: row.categoryKind ?? 'uncategorized',
    pending: row.pending,
  };
}
