/**
 * Alerts, stored and delivered.
 *
 * The rules live in `core/alerts.ts`; this file finds the facts, refuses to
 * store the same one twice, and sends what has not been sent.
 *
 * ## Why a dedupe key
 *
 * The checker is meant for `cron`, so it looks at the same month, the same
 * connection and the same subscription every day. Each alert carries a key built
 * from the fact — the budget, the month and the level; the attempt that failed;
 * the charge; the price; the due date — and the unique index on
 * `(user_id, dedupe_key)` makes a second look a no-op. Nothing has to remember
 * what it said last time.
 *
 * ## Why delivery is here
 *
 * A webhook is a second way to say the same thing, not a second source of
 * truth: the alert is stored first, sent second, and marked sent only when the
 * endpoint answered. A failed send is retried on the next run, and the error is
 * kept, so a silent webhook is visible in the database instead of lost.
 */

import { and, asc, count, desc, eq, gte, isNull, lt, lte, notInArray, or } from 'drizzle-orm';

import {
  addMonths,
  budgetAlert,
  budgetStatus,
  connectionAlert,
  largeTransactionAlert,
  monthKey,
  recurringDueAlert,
  recurringPriceAlert,
  toDashboardTransactions,
  webhookRequest,
  type AlertDraft,
  type PlainDate,
} from '@moneytracker/core';

import type { Database } from './client.ts';
import { listBudgets, toBudgets } from './budgets.ts';
import { listConnections } from './connections.ts';
import { listDashboardTransactions } from './queries.ts';
import { listRecurringItems } from './recurring.ts';
import { alerts, categories, categoryAssignments, transactions } from './schema.ts';

/** How far back a charge is still worth mentioning. */
const LARGE_TRANSACTION_LOOKBACK_DAYS = 35;

/** How many pending deliveries one run will try. */
const DELIVERY_BATCH = 20;

/** How many times a failing webhook is tried before the alert is left alone. */
const MAX_DELIVERY_ATTEMPTS = 5;

/** The day, in the account's timezone, as a plain date. */
function todayIn(timeZone: string, now: Date): PlainDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Whole days from one plain date to another. */
function daysBetween(from: PlainDate, to: PlainDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** A stored alert, as the inbox shows it. */
export interface AlertRow {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  dedupeKey: string;
  createdAt: Date;
  readAt: Date | null;
  notifiedAt: Date | null;
  notifyAttempts: number;
  lastNotifyError: string | null;
}

/**
 * The alerts of a user, newest first.
 *
 * @example
 * const alerts = await listAlerts(db, userId, { unreadOnly: true });
 */
export async function listAlerts(
  db: Database,
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<AlertRow[]> {
  return db
    .select({
      id: alerts.id,
      kind: alerts.kind,
      title: alerts.title,
      body: alerts.body,
      href: alerts.href,
      dedupeKey: alerts.dedupeKey,
      createdAt: alerts.createdAt,
      readAt: alerts.readAt,
      notifiedAt: alerts.notifiedAt,
      notifyAttempts: alerts.notifyAttempts,
      lastNotifyError: alerts.lastNotifyError,
    })
    .from(alerts)
    .where(
      options.unreadOnly
        ? and(eq(alerts.userId, userId), isNull(alerts.readAt))
        : eq(alerts.userId, userId),
    )
    .orderBy(desc(alerts.createdAt))
    .limit(options.limit ?? 50);
}

/** How many alerts are still new. */
export async function countUnreadAlerts(db: Database, userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(alerts)
    .where(and(eq(alerts.userId, userId), isNull(alerts.readAt)));

  return rows[0]?.value ?? 0;
}

/**
 * Marks one alert as seen.
 *
 * @example
 * await markAlertRead(db, userId, alertId);
 */
export async function markAlertRead(
  db: Database,
  userId: string,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(alerts)
    .set({ readAt: now })
    .where(and(eq(alerts.userId, userId), eq(alerts.id, id), isNull(alerts.readAt)))
    .returning({ id: alerts.id });

  return rows.length > 0;
}

/**
 * Marks every unread alert as seen, and reports how many there were.
 *
 * @example
 * await markAllAlertsRead(db, userId);
 */
export async function markAllAlertsRead(
  db: Database,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(alerts)
    .set({ readAt: now })
    .where(and(eq(alerts.userId, userId), isNull(alerts.readAt)))
    .returning({ id: alerts.id });

  return rows.length;
}

/**
 * Stores one alert unless the same fact is already stored.
 *
 * @example
 * await createAlert(db, userId, draft); // false when it already existed
 */
export async function createAlert(
  db: Database,
  userId: string,
  draft: AlertDraft,
): Promise<boolean> {
  const rows = await db
    .insert(alerts)
    .values({
      userId,
      kind: draft.kind,
      title: draft.title,
      body: draft.body,
      href: draft.href,
      dedupeKey: draft.dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: alerts.id });

  return rows.length > 0;
}

/**
 * Looks at the books and stores the alerts that are due.
 *
 * Everything is best-effort: a connection that cannot be read, or a table with
 * an odd row, must not stop the other three rules. The new alerts are returned
 * so the caller can say what happened.
 *
 * @example
 * const raised = await evaluateAlerts(db, userId, {
 *   timeZone: 'America/Los_Angeles', currency: 'USD', largeTransactionMinor: 50_000,
 * });
 */
export async function evaluateAlerts(
  db: Database,
  userId: string,
  options: {
    timeZone: string;
    currency: string;
    locale?: string;
    now?: Date;
    /** Charges at or above this are worth an alert; zero or less turns it off. */
    largeTransactionMinor?: number;
    /** How many days ahead a bill is worth mentioning. */
    dueDays?: number;
  },
): Promise<AlertDraft[]> {
  const now = options.now ?? new Date();
  const month = monthKey(now, options.timeZone);
  const dueDays = options.dueDays ?? 3;
  const raised: AlertDraft[] = [];

  const remember = async (draft: AlertDraft | null) => {
    if (!draft) return;
    if (await createAlert(db, userId, draft)) raised.push(draft);
  };

  // Budgets: this month, with enough history for a rollover.
  const from = `${addMonths(month, -1)}-01`;
  const [budgetRows, transactionRows] = await Promise.all([
    listBudgets(db, userId),
    listDashboardTransactions(db, userId, { from, to: todayIn(options.timeZone, now) }),
  ]);
  const statuses = budgetStatus(
    transactionRows.flatMap(toDashboardTransactions),
    toBudgets(budgetRows),
    { month, timeZone: options.timeZone },
  );
  const budgetIdByCategory = new Map(budgetRows.map((row) => [row.categoryId, row.id]));
  for (const status of statuses) {
    await remember(
      budgetAlert({
        budgetId: budgetIdByCategory.get(status.categoryId) ?? status.categoryId,
        categoryName: status.categoryName,
        month,
        spentMinor: status.spentMinor,
        effectiveBudgetMinor: status.effectiveBudgetMinor,
        percentUsed: status.percentUsed,
        overBudget: status.overBudget,
        currency: options.currency,
        locale: options.locale,
      }),
    );
  }

  // Connections: only an error is worth a sentence. The attempt's time is in
  // the key, so a daily failure is a daily reminder and a recovery is silent.
  try {
    const connections = await listConnections(db, userId);
    for (const connection of connections) {
      if (connection.status !== 'error' || !connection.lastError) continue;
      await remember(
        connectionAlert({
          connectionId: connection.id,
          name: connection.name,
          error: connection.lastError,
          lastAttemptAt: connection.updatedAt,
        }),
      );
    }
  } catch {
    // A provider table that cannot be read does not silence the other rules.
  }

  // Large charges: money out, not a transfer, not pending.
  if (options.largeTransactionMinor && options.largeTransactionMinor > 0) {
    const since = new Date(now.getTime() - LARGE_TRANSACTION_LOOKBACK_DAYS * 86_400_000);
    const rows = await db
      .select({
        id: transactions.id,
        amountMinor: transactions.amountMinor,
        currency: transactions.currency,
        postedDate: transactions.postedDate,
        merchantRaw: transactions.merchantRaw,
        descriptionRaw: transactions.descriptionRaw,
      })
      .from(transactions)
      .leftJoin(categoryAssignments, eq(categoryAssignments.transactionId, transactions.id))
      .leftJoin(categories, eq(categories.id, categoryAssignments.categoryId))
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.pending, false),
          isNull(transactions.transferGroupId),
          // A transfer that was categorized but never paired is still not a
          // purchase. Uncategorized charges are fair game.
          or(isNull(categories.kind), notInArray(categories.kind, ['transfer', 'income'])),
          lte(transactions.amountMinor, -options.largeTransactionMinor),
          gte(transactions.postedAt, since),
        ),
      )
      .orderBy(desc(transactions.postedAt))
      .limit(200);

    for (const row of rows) {
      const merchant = (row.merchantRaw ?? row.descriptionRaw).trim().slice(0, 80);
      await remember(
        largeTransactionAlert({
          transactionId: row.id,
          merchant: merchant || 'A charge',
          amountMinor: row.amountMinor,
          currency: row.currency,
          postedDate: row.postedDate,
          thresholdMinor: options.largeTransactionMinor,
          locale: options.locale,
        }),
      );
    }
  }

  // Subscriptions: a price that moved, or one that is about to land.
  const today = todayIn(options.timeZone, now);
  const items = await listRecurringItems(db, userId);
  for (const item of items) {
    if (
      item.priceChanged &&
      item.previousAmountMinor !== null &&
      item.previousAmountMinor !== item.amountMinor
    ) {
      await remember(
        recurringPriceAlert({
          itemId: item.id,
          name: item.merchantName,
          previousAmountMinor: item.previousAmountMinor,
          amountMinor: item.amountMinor,
          cadence: item.cadence,
          currency: item.currency,
          locale: options.locale,
        }),
      );
    }

    const daysUntil = daysBetween(today, item.nextDate);
    // A subscription that stopped charging long ago is not "due": the window
    // looks a little back and a few days ahead, nothing more.
    if (daysUntil <= dueDays && daysUntil >= -dueDays) {
      await remember(
        recurringDueAlert({
          itemId: item.id,
          name: item.merchantName,
          amountMinor: item.amountMinor,
          cadence: item.cadence,
          dueDate: item.nextDate,
          daysUntil,
          currency: item.currency,
          locale: options.locale,
        }),
      );
    }
  }

  return raised;
}

/** The answer a webhook gave, or failed to give. */
interface SendResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Sends one alert, with a timeout: a hung webhook must not hang the checker. */
async function postAlert(
  url: string,
  request: { body: string; headers: Record<string, string> },
): Promise<SendResult> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The request failed.' };
  }
}

/**
 * Sends the alerts that have not been delivered yet.
 *
 * A failure is not thrown: it is written to the alert, which stays pending and
 * is tried again next time, until the attempts run out. The caller gets the
 * count either way.
 *
 * @example
 * await deliverAlerts(db, userId, { url: 'https://ntfy.sh/my-money' });
 */
export async function deliverAlerts(
  db: Database,
  userId: string,
  options: {
    url: string;
    /** The app's own address, for the link in the message. */
    baseUrl?: string;
    now?: Date;
    limit?: number;
    maxAttempts?: number;
    /** Replaces fetch in tests. */
    send?: (
      url: string,
      request: { body: string; headers: Record<string, string> },
    ) => Promise<SendResult>;
  },
): Promise<{ sent: number; failed: number }> {
  const now = options.now ?? new Date();
  const send = options.send ?? postAlert;

  const pending = await db
    .select({
      id: alerts.id,
      kind: alerts.kind,
      href: alerts.href,
      notifyAttempts: alerts.notifyAttempts,
    })
    .from(alerts)
    .where(
      and(
        eq(alerts.userId, userId),
        isNull(alerts.notifiedAt),
        lt(alerts.notifyAttempts, options.maxAttempts ?? MAX_DELIVERY_ATTEMPTS),
      ),
    )
    .orderBy(asc(alerts.createdAt))
    .limit(options.limit ?? DELIVERY_BATCH);

  let sent = 0;
  let failed = 0;

  for (const alert of pending) {
    const request = webhookRequest(alert, options.baseUrl);
    const result = await send(options.url, request);

    if (result.ok) {
      sent += 1;
      await db
        .update(alerts)
        .set({
          notifiedAt: now,
          notifyAttempts: alert.notifyAttempts + 1,
          lastNotifyError: null,
        })
        .where(eq(alerts.id, alert.id));
    } else {
      failed += 1;
      await db
        .update(alerts)
        .set({
          notifyAttempts: alert.notifyAttempts + 1,
          lastNotifyError: result.error ?? `The endpoint answered ${result.status ?? 'nothing'}.`,
        })
        .where(eq(alerts.id, alert.id));
    }
  }

  return { sent, failed };
}
