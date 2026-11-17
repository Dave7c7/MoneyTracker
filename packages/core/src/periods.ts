/**
 * Grouping transactions by day or by week.
 *
 * Works on plain dates (YYYY-MM-DD), so a transaction belongs to the day the
 * bank posted it, whatever the viewer's time zone. Weeks start on Sunday by
 * default, like a US calendar.
 *
 * Totals follow the money rules: transfers between the user's own accounts are
 * neither money out nor money in, so they are listed but never counted.
 */

import { addDaysToPlainDate, parsePlainDate, type PlainDate } from './dates.ts';

/** How to group: one group per day, or one per week. */
export type Period = 'day' | 'week';

/** 0 = Sunday ... 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The least a row needs to be grouped. */
export interface PeriodRow {
  /** Null while the transaction is pending. */
  postedDate: PlainDate | null;
  /** Integer minor units. Negative = money out. */
  amountMinor: number;
  /** True for transfers between the user's own accounts: listed, never counted. */
  isTransfer?: boolean;
}

/** One day or one week of transactions. */
export interface PeriodGroup<T extends PeriodRow> {
  /** "pending", or the first day of the period. */
  key: string;
  /** First day of the period; null for the pending group. */
  start: PlainDate | null;
  /** Last day of the period; null for the pending group. */
  end: PlainDate | null;
  rows: T[];
  /** Money out, as a positive number of minor units. */
  outMinor: number;
  /** Money in, as a positive number of minor units. */
  inMinor: number;
  /** In minus out. */
  netMinor: number;
}

/**
 * The first day of the week a date belongs to.
 *
 * @example
 * weekStart('2026-11-18'); // "2026-11-15" (a Wednesday; the week starts Sunday)
 * weekStart('2026-11-18', 1); // "2026-11-16" (weeks starting Monday)
 */
export function weekStart(date: PlainDate, weekStartsOn: Weekday = 0): PlainDate {
  const weekday = parsePlainDate(date).getUTCDay();
  const back = (weekday - weekStartsOn + 7) % 7;
  return addDaysToPlainDate(date, -back);
}

/**
 * Groups rows by day or week, newest first, with money in and out per group.
 *
 * Pending rows (no posted date) come first, in a group of their own. Rows keep
 * their order inside a group.
 *
 * @example
 * const weeks = groupByPeriod(rows, 'week');
 * weeks[0].outMinor; // 18_250
 */
export function groupByPeriod<T extends PeriodRow>(
  rows: readonly T[],
  period: Period,
  weekStartsOn: Weekday = 0,
): PeriodGroup<T>[] {
  const groups = new Map<string, PeriodGroup<T>>();

  for (const row of rows) {
    let key = 'pending';
    let start: PlainDate | null = null;
    let end: PlainDate | null = null;

    if (row.postedDate) {
      start = period === 'day' ? row.postedDate : weekStart(row.postedDate, weekStartsOn);
      end = period === 'day' ? start : addDaysToPlainDate(start, 6);
      key = start;
    }

    let group = groups.get(key);
    if (!group) {
      group = { key, start, end, rows: [], outMinor: 0, inMinor: 0, netMinor: 0 };
      groups.set(key, group);
    }

    group.rows.push(row);
    if (!row.isTransfer) {
      if (row.amountMinor < 0) group.outMinor -= row.amountMinor;
      else group.inMinor += row.amountMinor;
      group.netMinor += row.amountMinor;
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.start === null) return -1;
    if (b.start === null) return 1;
    return b.start.localeCompare(a.start);
  });
}
