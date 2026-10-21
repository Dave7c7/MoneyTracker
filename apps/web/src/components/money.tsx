import { formatMoney } from '@moneytracker/core';

import { UI_CURRENCY, UI_LOCALE } from '@/lib/settings.ts';

/**
 * Formats an amount for display.
 *
 * Formatting happens here and nowhere else: money is an integer number of
 * minor units everywhere else in the app.
 *
 * @example
 * formatAmount(-1999, 'USD'); // "-$19.99"
 */
export function formatAmount(amountMinor: number, currency = UI_CURRENCY): string {
  return formatMoney(amountMinor, currency, UI_LOCALE);
}

/**
 * Formats an amount with an explicit sign, e.g. for cash flow.
 *
 * @example
 * formatSignedAmount(-1999, 'USD'); // "-$19.99"
 */
export function formatSignedAmount(amountMinor: number, currency = UI_CURRENCY): string {
  const formatted = formatAmount(Math.abs(amountMinor), currency);
  if (amountMinor > 0) return `+${formatted}`;
  if (amountMinor < 0) return `-${formatted}`;
  return formatted;
}

/**
 * Renders an amount. Incoming amounts are green, outgoing ones are neutral.
 */
export function Money({
  amountMinor,
  currency,
  className = '',
}: {
  amountMinor: number;
  currency?: string;
  className?: string;
}) {
  const tone = amountMinor > 0 ? 'text-emerald-600 dark:text-emerald-400' : '';
  return (
    <span className={`tabular ${tone} ${className}`}>{formatAmount(amountMinor, currency)}</span>
  );
}
