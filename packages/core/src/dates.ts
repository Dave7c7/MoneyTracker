/**
 * Date helpers.
 *
 * Timestamps are stored in UTC. `posted_date` is a plain date (YYYY-MM-DD)
 * derived from the UTC timestamp without shifting. Monthly buckets use the
 * user's configured timezone, so "January" means January where the user lives.
 */

/** A month bucket key, e.g. "2026-01". */
export type MonthKey = string;

/** A plain date string, e.g. "2026-01-31". */
export type PlainDate = string;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Converts an instant to the plain UTC date it falls on.
 *
 * @example
 * toPlainDate(new Date('2026-01-31T23:30:00Z')); // "2026-01-31"
 */
export function toPlainDate(date: Date): PlainDate {
  return date.toISOString().slice(0, 10);
}

/**
 * Parses a plain date into a UTC midnight instant.
 *
 * @example
 * parsePlainDate('2026-01-31'); // 2026-01-31T00:00:00.000Z
 */
export function parsePlainDate(date: PlainDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Returns the month bucket of an instant in the given timezone.
 *
 * @example
 * monthKey(new Date('2026-02-01T02:00:00Z'), 'America/Los_Angeles'); // "2026-01"
 */
export function monthKey(date: Date, timeZone: string): MonthKey {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

/**
 * Returns the month bucket of a plain date. No timezone involved.
 *
 * @example
 * monthKeyFromPlainDate('2026-01-31'); // "2026-01"
 */
export function monthKeyFromPlainDate(date: PlainDate): MonthKey {
  return date.slice(0, 7);
}

/**
 * Adds months to a month bucket key, handling year boundaries.
 *
 * @example
 * addMonths('2026-12', 1); // "2027-01"
 */
export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart);
  const absolute = year * 12 + (monthIndex - 1) + delta;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = (absolute % 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`;
}

/**
 * Returns every month bucket between two keys, inclusive and ascending.
 *
 * @example
 * monthRange('2025-11', '2026-02'); // ["2025-11", "2025-12", "2026-01", "2026-02"]
 */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  let cursor = from;
  // Guard against absurd ranges; 600 months is 50 years.
  for (let i = 0; i < 600; i += 1) {
    months.push(cursor);
    if (cursor === to) break;
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/**
 * Adds (or subtracts) whole days to an instant.
 *
 * @example
 * addDays(new Date('2026-01-31T00:00:00Z'), 1); // 2026-02-01T00:00:00.000Z
 */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Whole days between two instants, by UTC date.
 *
 * @example
 * differenceInDays(new Date('2026-01-02Z'), new Date('2026-01-01Z')); // 1
 */
export function differenceInDays(later: Date, earlier: Date): number {
  const a = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
  const b = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
  return Math.round((a - b) / 86_400_000);
}

/**
 * Formats a month key for display, e.g. "Jan 2026".
 *
 * @example
 * formatMonthLabel('2026-01'); // "Jan 2026"
 */
export function formatMonthLabel(month: MonthKey, locale = 'en-US'): string {
  const [yearPart, monthPart] = month.split('-');
  const date = new Date(Date.UTC(Number(yearPart), Number(monthPart) - 1, 1));
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Adds days to a plain date.
 *
 * @example
 * addDaysToPlainDate('2026-01-30', 3); // "2026-02-02"
 */
export function addDaysToPlainDate(date: PlainDate, days: number): PlainDate {
  const instant = parsePlainDate(date);
  return toPlainDate(new Date(instant.getTime() + days * 86_400_000));
}

/**
 * Adds months to a plain date, keeping the day of the month.
 *
 * A day that does not exist in the target month is clamped to the last day of
 * that month, so the 31st of January becomes the 28th of February.
 *
 * @example
 * addMonthsToPlainDate('2026-01-31', 1); // "2026-02-28"
 */
export function addMonthsToPlainDate(date: PlainDate, months: number): PlainDate {
  const [yearPart, monthPart, dayPart] = date.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const day = Number(dayPart);
  const absolute = year * 12 + monthIndex + months;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = (absolute % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/**
 * Builds a plain date in a month, clamping the day to the length of that month.
 *
 * The 31st of a short month becomes the 28th or the 29th, so a bill that
 * lands on the 31st still has a date in February.
 *
 * @example
 * plainDateInMonth('2026-02', 31); // "2026-02-28"
 */
export function plainDateInMonth(month: MonthKey, day: number): PlainDate {
  const [yearPart, monthPart] = month.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const clampedDay = Math.min(Math.max(1, Math.trunc(day)), lastDay);
  return `${String(year).padStart(4, '0')}-${String(monthIndex).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/**
 * Adds years to a plain date, keeping the day of the month.
 *
 * The 29th of February becomes the 28th of February in a common year.
 *
 * @example
 * addYearsToPlainDate('2024-02-29', 1); // "2025-02-28"
 */
export function addYearsToPlainDate(date: PlainDate, years: number): PlainDate {
  const [yearPart, monthPart, dayPart] = date.split('-');
  const year = Number(yearPart) + years;
  const month = Number(monthPart);
  const day = Number(dayPart);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}
