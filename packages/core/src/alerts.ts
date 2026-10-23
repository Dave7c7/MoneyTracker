/**
 * Alerts: the sentences the app says without being asked.
 *
 * An alert is raised by a rule the person can read — a budget is nearly used
 * up, a connection stopped syncing, a large charge appeared, a subscription
 * changed price or is due. Nothing here reads the database or sends anything:
 * each function turns facts into a title, a sentence, a place to look and a
 * key that stops the same alert being raised twice.
 *
 * The key matters. The checker runs on a timer, so the same fact is looked at
 * again and again; a budget that is at 91% today and 92% tomorrow is one alert,
 * not two. A price that changes again is a new one, and says so in its key.
 */

import { formatMoney } from './money.ts';
import type { RecurringCadence } from './recurring.ts';
import type { MonthKey, PlainDate } from './dates.ts';

/** What raised an alert. */
export type AlertKind = 'budget' | 'sync' | 'large-transaction' | 'recurring';

/** An alert before it is stored. */
export interface AlertDraft {
  kind: AlertKind;
  title: string;
  body: string;
  /** Where to look, as a path in this app. */
  href: string | null;
  /** Stable identity. The database accepts one alert per key. */
  dedupeKey: string;
}

/** The share of a budget that is worth saying out loud. */
export const BUDGET_ALERT_PERCENT = 90;

/** How a cadence is said in a sentence. */
const CADENCE_WORDS: Record<RecurringCadence, string> = {
  weekly: 'a week',
  monthly: 'a month',
  annual: 'a year',
};

/**
 * A budget that is nearly used up, or over.
 *
 * Passing the limit is worse than approaching it, so over the limit is the
 * alert that is raised; the 90% one is only raised while the spending is still
 * under. That keeps one budget to one alert a month in the usual case.
 *
 * @example
 * budgetAlert({ ...status, budgetId, month, currency }); // { title: 'Groceries is at 91%', ... }
 */
export function budgetAlert(input: {
  budgetId: string;
  categoryName: string;
  month: MonthKey;
  spentMinor: number;
  effectiveBudgetMinor: number;
  percentUsed: number;
  overBudget: boolean;
  currency: string;
  locale?: string;
}): AlertDraft | null {
  if (input.effectiveBudgetMinor <= 0) return null;

  const spent = formatMoney(input.spentMinor, input.currency, input.locale);
  const limit = formatMoney(input.effectiveBudgetMinor, input.currency, input.locale);

  if (input.percentUsed >= 100) {
    return {
      kind: 'budget',
      dedupeKey: `budget:${input.budgetId}:${input.month}:over`,
      title: input.overBudget
        ? `${input.categoryName} is over budget`
        : `${input.categoryName} has reached its budget`,
      body: input.overBudget
        ? `Spent ${spent} of ${limit} this month, ${formatMoney(
            input.spentMinor - input.effectiveBudgetMinor,
            input.currency,
            input.locale,
          )} over.`
        : `Spent ${spent} of ${limit} this month. There is nothing left in this budget.`,
      href: '/budgets',
    };
  }

  if (input.percentUsed < BUDGET_ALERT_PERCENT) return null;

  return {
    kind: 'budget',
    dedupeKey: `budget:${input.budgetId}:${input.month}:near`,
    title: `${input.categoryName} is at ${Math.floor(input.percentUsed)}% of its budget`,
    body: `Spent ${spent} of ${limit} this month.`,
    href: '/budgets',
  };
}

/**
 * A connection that reported an error.
 *
 * One alert per failed attempt: the key carries the moment of the attempt, so
 * a connection that keeps failing says so once per try rather than once for
 * ever, and a connection that recovers and fails again speaks up again.
 *
 * @example
 * connectionAlert({ connectionId, name: 'SoFi', error: 'Token expired', lastAttemptAt });
 */
export function connectionAlert(input: {
  connectionId: string;
  name: string;
  error: string;
  lastAttemptAt: Date;
}): AlertDraft {
  return {
    kind: 'sync',
    dedupeKey: `sync:${input.connectionId}:${input.lastAttemptAt.toISOString()}`,
    title: `${input.name} stopped syncing`,
    body: `The connection said: ${input.error.trim()} The app will try again on its next run.`,
    href: '/connections',
  };
}

/**
 * A charge at or above the threshold the person set.
 *
 * Only money going out counts, and the caller leaves transfers and pending
 * charges out before asking: a card payment is not a purchase, and a pending
 * charge has not happened yet.
 *
 * @example
 * largeTransactionAlert({ transactionId, merchant: 'SoFi', amountMinor: -120000, ... });
 */
export function largeTransactionAlert(input: {
  transactionId: string;
  merchant: string;
  amountMinor: number;
  currency: string;
  postedDate: PlainDate | null;
  thresholdMinor: number;
  locale?: string;
}): AlertDraft | null {
  if (input.thresholdMinor <= 0) return null;

  const spentMinor = -input.amountMinor;
  if (spentMinor < input.thresholdMinor) return null;

  const amount = formatMoney(spentMinor, input.currency, input.locale);
  const when = input.postedDate ? ` on ${input.postedDate}` : '';

  return {
    kind: 'large-transaction',
    dedupeKey: `transaction:${input.transactionId}`,
    title: `${input.merchant}: ${amount}`,
    body: `A charge of ${amount}${when}. You asked to hear about charges of ${formatMoney(
      input.thresholdMinor,
      input.currency,
      input.locale,
    )} or more.`,
    href: '/transactions',
  };
}

/**
 * A subscription that changed price.
 *
 * The key carries the new price, so a second change is a second alert and the
 * same change noticed twice is not.
 */
export function recurringPriceAlert(input: {
  itemId: string;
  name: string;
  previousAmountMinor: number;
  amountMinor: number;
  cadence: RecurringCadence;
  currency: string;
  locale?: string;
}): AlertDraft {
  const before = formatMoney(input.previousAmountMinor, input.currency, input.locale);
  const now = formatMoney(input.amountMinor, input.currency, input.locale);

  return {
    kind: 'recurring',
    dedupeKey: `recurring:${input.itemId}:price:${input.amountMinor}`,
    title: `${input.name} changed price`,
    body: `It went from ${before} to ${now} ${CADENCE_WORDS[input.cadence]}.`,
    href: '/subscriptions',
  };
}

/**
 * A subscription that is due soon.
 *
 * The key is the expected date, so the same bill is mentioned once, and the
 * next one is a new alert.
 */
export function recurringDueAlert(input: {
  itemId: string;
  name: string;
  amountMinor: number;
  cadence: RecurringCadence;
  dueDate: PlainDate;
  daysUntil: number;
  currency: string;
  locale?: string;
}): AlertDraft {
  const amount = formatMoney(input.amountMinor, input.currency, input.locale);
  const when =
    input.daysUntil < 0
      ? 'is overdue'
      : input.daysUntil === 0
        ? 'is due today'
        : input.daysUntil === 1
          ? 'is due tomorrow'
          : `is due in ${input.daysUntil} days`;

  return {
    kind: 'recurring',
    dedupeKey: `recurring:${input.itemId}:due:${input.dueDate}`,
    title: `${input.name} ${when}`,
    body:
      input.daysUntil < 0
        ? `${amount} was expected on ${input.dueDate}.`
        : `${amount} is expected on ${input.dueDate}.`,
    href: '/subscriptions',
  };
}

/** What a webhook may say about each kind of alert, with no personal detail. */
const WEBHOOK_SUMMARIES: Record<AlertKind, string> = {
  budget: 'A budget needs attention',
  sync: 'A bank connection stopped syncing',
  'large-transaction': 'A large transaction was posted',
  recurring: 'A recurring charge needs attention',
};

/** A kind this version does not know still gets a sentence, not a blank. */
const UNKNOWN_WEBHOOK_SUMMARY = 'There is something new in MoneyTracker';

/**
 * The text a webhook receives.
 *
 * A webhook often ends at a third party — `ntfy.sh` is the usual host — so the
 * message says what happened without an amount, a merchant, a category or a
 * connection name. The inbox has the detail; the phone only needs to know
 * there is something to open.
 *
 * `ntfy` shows the first line as the notification and accepts the headers
 * below; any script can read the body.
 *
 * @example
 * webhookText({ kind: 'budget', href: '/budgets' }, 'https://money.example.com');
 */
export function webhookText(
  alert: { kind: string; href: string | null },
  baseUrl?: string,
): string {
  const summary = WEBHOOK_SUMMARIES[alert.kind as AlertKind] ?? UNKNOWN_WEBHOOK_SUMMARY;
  const link =
    alert.href && baseUrl ? `${baseUrl.replace(/\/+$/, '')}${alert.href}` : (alert.href ?? null);
  return [summary, link].filter((line): line is string => Boolean(line)).join('\n');
}

/**
 * The headers and body of the webhook request.
 *
 * `Title`, `Tags` and `Click` are what `ntfy` reads; `Content-Type` is what
 * everything else reads. The title is the same summary as the body, for the
 * same reason: a notification preview is as public as the endpoint.
 *
 * A service with its own JSON shape (Discord, Slack) needs a relay, and the
 * README says so.
 */
export function webhookRequest(
  alert: { kind: string; href: string | null },
  baseUrl?: string,
): { body: string; headers: Record<string, string> } {
  const link = alert.href && baseUrl ? `${baseUrl.replace(/\/+$/, '')}${alert.href}` : null;

  return {
    body: webhookText(alert, baseUrl),
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Title: WEBHOOK_SUMMARIES[alert.kind as AlertKind] ?? UNKNOWN_WEBHOOK_SUMMARY,
      Tags: 'money',
      ...(link ? { Click: link } : {}),
    },
  };
}
