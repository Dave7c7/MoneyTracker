/**
 * Display helpers that are not money formatting.
 */

import { formatMonthLabel } from '@moneytracker/core';

/**
 * Formats a plain date for display, e.g. "Oct 15".
 *
 * A transaction that has not posted yet has no date; the UI marks those with
 * a pending badge instead.
 *
 * @example
 * formatShortDate('2026-10-15'); // "Oct 15"
 */
export function formatShortDate(plainDate: string | null, locale = 'en-US'): string {
  if (!plainDate) return '—';
  const date = new Date(`${plainDate}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Formats a month bucket for display, e.g. "Oct 2026".
 *
 * @example
 * formatMonth('2026-10'); // "Oct 2026"
 */
export function formatMonth(month: string, locale = 'en-US'): string {
  return formatMonthLabel(month, locale);
}

/**
 * Formats a percentage with a sign.
 *
 * @example
 * formatPercent(-12.345); // "-12.3%"
 */
export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

/**
 * Formats an account name with the masked number.
 *
 * @example
 * formatAccountName('Everyday Checking', '4417'); // "Everyday Checking ••4417"
 */
export function formatAccountName(name: string, mask: string | null): string {
  return mask ? `${name} ••${mask}` : name;
}
