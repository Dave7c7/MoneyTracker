/**
 * Recurring charge detection.
 *
 * A subscription or a bill is the same merchant, roughly the same amount, on
 * a regular rhythm. Everything else is a one-off. The matcher is a pure
 * function over a flat list of transactions, so it can be tested against
 * hand-checked fixtures.
 *
 * The rules come from `rules/data-and-money.md`: the same normalized merchant,
 * three or more occurrences, amounts within ten percent, and a regular
 * cadence. A price change is not a different subscription, so it is reported
 * rather than treated as a reason to stop looking.
 */

import {
  addDaysToPlainDate,
  addMonthsToPlainDate,
  addYearsToPlainDate,
  toPlainDate,
  type PlainDate,
} from './dates.ts';
import type { CategoryKind } from './types.ts';

/** How often a recurring charge lands. */
export type RecurringCadence = 'weekly' | 'monthly' | 'annual';

/** What the user decided about a recurring item. */
export type RecurringStatus = 'detected' | 'confirmed' | 'dismissed';

/** The transaction shape the detector needs. */
export interface RecurringCandidate {
  id: string;
  accountId: string;
  /** UTC timestamp. Pending transactions have none. */
  postedAt: Date | null;
  /** Signed: negative means money out. */
  amountMinor: number;
  currency: string;
  descriptionRaw: string;
  /** Normalized merchant key, when the transaction has a merchant. */
  merchantKey: string | null;
  merchantName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: CategoryKind;
  pending: boolean;
}

/** A recurring charge the detector found. */
export interface RecurringItem {
  /** Stable key: the account and the merchant together. */
  key: string;
  merchantKey: string | null;
  merchantName: string;
  accountId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  cadence: RecurringCadence;
  /** The current price, as a positive number. */
  amountMinor: number;
  currency: string;
  /** How many charges were found. */
  occurrences: number;
  firstDate: PlainDate;
  lastDate: PlainDate;
  /** The date the next charge is expected. */
  nextDate: PlainDate;
  /** True when the price moved by more than the price change threshold. */
  priceChanged: boolean;
  /** The price before the change, when the price changed. */
  previousAmountMinor: number | null;
  /** 0..1 */
  confidence: number;
  /** Why the app thinks this is recurring, in words. */
  reason: string;
}

/** Options for the detector. */
export interface RecurringDetectionOptions {
  /** The smallest number of charges that counts. Defaults to 3. */
  minOccurrences?: number;
  /** How far the amounts may spread, as a fraction. Defaults to 0.1. */
  amountTolerance?: number;
  /** How far the price may move before it is a price change. Defaults to 0.05. */
  priceChangeThreshold?: number;
}

/** The gap, in days, a charge of this cadence is expected to have. */
const CADENCE_DAYS: Record<RecurringCadence, { min: number; max: number }> = {
  weekly: { min: 6, max: 8 },
  monthly: { min: 27, max: 34 },
  annual: { min: 358, max: 372 },
};

/** The cost of a recurring charge per month and per year. */
export interface RecurringCost {
  /** What it costs in a typical month. */
  monthlyMinor: number;
  /** What it costs over a year. */
  annualMinor: number;
}

/**
 * What a recurring charge costs per month and per year.
 *
 * A weekly charge is spread over the year, a monthly one is taken as it is,
 * and an annual one is divided by twelve. The rounding is done with integers,
 * so the result is never a fraction of a cent.
 *
 * @example
 * recurringCost(1549, 'monthly'); // { monthlyMinor: 1549, annualMinor: 18588 }
 */
export function recurringCost(amountMinor: number, cadence: RecurringCadence): RecurringCost {
  switch (cadence) {
    case 'weekly':
      return {
        monthlyMinor: divideRounded(amountMinor * 52, 12),
        annualMinor: amountMinor * 52,
      };
    case 'annual':
      return {
        monthlyMinor: divideRounded(amountMinor, 12),
        annualMinor: amountMinor,
      };
    case 'monthly':
    default:
      return { monthlyMinor: amountMinor, annualMinor: amountMinor * 12 };
  }
}

/**
 * Finds the recurring charges in a list of transactions.
 *
 * Only money leaving the account counts: income and transfers are not
 * subscriptions, and a pending charge has no date to build a rhythm from.
 *
 * @example
 * const items = detectRecurring(transactions);
 * items[0]?.cadence; // 'monthly'
 */
export function detectRecurring(
  transactions: readonly RecurringCandidate[],
  options: RecurringDetectionOptions = {},
): RecurringItem[] {
  const minOccurrences = options.minOccurrences ?? 3;
  const amountTolerance = options.amountTolerance ?? 0.1;
  const priceChangeThreshold = options.priceChangeThreshold ?? 0.05;

  const groups = new Map<string, RecurringCandidate[]>();
  for (const transaction of transactions) {
    if (!isCandidate(transaction)) continue;
    const key = groupKey(transaction);
    const group = groups.get(key);
    if (group) group.push(transaction);
    else groups.set(key, [transaction]);
  }

  const items: RecurringItem[] = [];
  for (const [key, group] of groups) {
    if (group.length < minOccurrences) continue;

    const sorted = [...group].sort(
      (a, b) => (a.postedAt?.getTime() ?? 0) - (b.postedAt?.getTime() ?? 0),
    );
    const amounts = sorted.map((transaction) => -transaction.amountMinor);
    const median = medianOf(amounts);

    // The prices have to agree. A merchant whose amounts are all over the
    // place is not a subscription with a price change, it is just a merchant.
    const withinTolerance = amounts.filter(
      (amount) => Math.abs(amount - median) <= median * amountTolerance,
    ).length;
    if (withinTolerance * 2 < amounts.length) continue;

    const dates = sorted.map((transaction) => toPlainDate(transaction.postedAt as Date));
    const cadence = detectCadence(dates);
    if (!cadence) continue;

    const last = sorted[sorted.length - 1];
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    if (!last || !firstDate || !lastDate) continue;

    const current = amounts[amounts.length - 1] ?? 0;
    const { changed, previous } = detectPriceChange(amounts, priceChangeThreshold);

    items.push({
      key,
      merchantKey: last.merchantKey,
      merchantName: last.merchantName ?? last.descriptionRaw,
      accountId: last.accountId,
      categoryId: last.categoryId,
      categoryName: last.categoryName,
      cadence,
      amountMinor: current,
      currency: last.currency,
      occurrences: sorted.length,
      firstDate,
      lastDate,
      nextDate: nextExpectedDate(lastDate, cadence),
      priceChanged: changed,
      previousAmountMinor: previous,
      confidence: confidenceFor(sorted.length, cadence),
      reason: reasonFor(sorted.length, cadence, changed),
    });
  }

  return items.sort(
    (a, b) => b.amountMinor - a.amountMinor || a.merchantName.localeCompare(b.merchantName),
  );
}

/**
 * The recurring charges that are expected inside a window.
 *
 * @example
 * upcomingRecurring(items, { from: '2026-10-22', days: 30 });
 */
export function upcomingRecurring<T extends { nextDate: PlainDate }>(
  items: readonly T[],
  options: { from: PlainDate; days: number },
): T[] {
  const until = addDaysToPlainDate(options.from, options.days);
  return items
    .filter((item) => item.nextDate >= options.from && item.nextDate <= until)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

/**
 * The total cost of a list of recurring charges.
 *
 * @example
 * recurringTotals(items).monthlyMinor;
 */
export function recurringTotals(
  items: readonly { amountMinor: number; cadence: RecurringCadence }[],
): RecurringCost {
  let monthly = 0;
  let annual = 0;
  for (const item of items) {
    const cost = recurringCost(item.amountMinor, item.cadence);
    monthly += cost.monthlyMinor;
    annual += cost.annualMinor;
  }
  return { monthlyMinor: monthly, annualMinor: annual };
}

/** Only money leaving the account can be a subscription. */
function isCandidate(transaction: RecurringCandidate): boolean {
  if (transaction.pending) return false;
  if (transaction.postedAt === null) return false;
  if (transaction.amountMinor >= 0) return false;
  if (transaction.categoryKind === 'income' || transaction.categoryKind === 'transfer')
    return false;
  return true;
}

/** The key charges are grouped by: the account and the merchant together. */
function groupKey(transaction: RecurringCandidate): string {
  const merchant = transaction.merchantKey ?? transaction.descriptionRaw.trim().toLowerCase();
  return `${transaction.accountId}:${merchant}`;
}

/**
 * The cadence the charges follow.
 *
 * Every gap between two charges has to fit the cadence, otherwise the rhythm
 * is broken and the merchant is not recurring.
 */
function detectCadence(dates: readonly PlainDate[]): RecurringCadence | null {
  const gaps: number[] = [];
  for (let index = 1; index < dates.length; index += 1) {
    const later = dates[index];
    const earlier = dates[index - 1];
    if (!later || !earlier) continue;
    gaps.push(daysBetween(later, earlier));
  }
  if (gaps.length === 0) return null;

  for (const cadence of ['weekly', 'monthly', 'annual'] as const) {
    const range = CADENCE_DAYS[cadence];
    if (gaps.every((gap) => gap >= range.min && gap <= range.max)) return cadence;
  }
  return null;
}

/**
 * Whether the price moved, and what it was before.
 *
 * A price change is a step, not a wobble: the older charges and the newer
 * charges sit at different levels, and the newer ones agree with each other.
 * A utility bill that is a little different every month is not a price
 * change, it is a bill.
 */
function detectPriceChange(
  amounts: readonly number[],
  threshold: number,
): { changed: boolean; previous: number | null } {
  if (amounts.length < 3) return { changed: false, previous: null };

  const third = Math.max(1, Math.floor(amounts.length / 3));
  const earlier = amounts.slice(0, third);
  const later = amounts.slice(-third);
  const earlierMedian = medianOf(earlier);
  const laterMedian = medianOf(later);
  if (earlierMedian === 0) return { changed: false, previous: null };

  if (Math.abs(laterMedian - earlierMedian) <= earlierMedian * threshold) {
    return { changed: false, previous: null };
  }

  // The newer charges have to sit at one price. When they do not, the amount
  // simply varies and there is no new price.
  const spread = Math.max(...later) - Math.min(...later);
  if (spread > laterMedian * threshold) return { changed: false, previous: null };

  return { changed: true, previous: earlierMedian };
}

/** The date the next charge is expected. */
function nextExpectedDate(lastDate: PlainDate, cadence: RecurringCadence): PlainDate {
  switch (cadence) {
    case 'weekly':
      return addDaysToPlainDate(lastDate, 7);
    case 'annual':
      return addYearsToPlainDate(lastDate, 1);
    case 'monthly':
    default:
      return addMonthsToPlainDate(lastDate, 1);
  }
}

/**
 * How sure the detector is.
 *
 * More charges and a clean rhythm make it more certain. It never reaches
 * one: the user confirms what the app found.
 */
function confidenceFor(occurrences: number, cadence: RecurringCadence): number {
  const base = 0.5 + Math.min(occurrences, 12) * 0.03;
  const rhythm = cadence === 'annual' ? 0 : 0.05;
  return Math.min(0.95, Math.round((base + rhythm) * 100) / 100);
}

/** The sentence the app shows to explain itself. */
function reasonFor(occurrences: number, cadence: RecurringCadence, priceChanged: boolean): string {
  const times = occurrences === 1 ? 'once' : `${occurrences} times`;
  const rhythm =
    cadence === 'weekly'
      ? 'about once a week'
      : cadence === 'annual'
        ? 'about once a year'
        : 'about once a month';
  const change = priceChanged ? ' The price changed since the first charge.' : '';
  return `Found ${times}, ${rhythm}.${change}`;
}

/** The middle value of a list of numbers. */
function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

/** Divides without ever producing a fraction of a cent. */
function divideRounded(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

/** Whole days between two plain dates. */
function daysBetween(later: PlainDate, earlier: PlainDate): number {
  const a = Date.parse(`${later}T00:00:00Z`);
  const b = Date.parse(`${earlier}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}
