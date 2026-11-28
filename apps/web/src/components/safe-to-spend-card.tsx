import Link from 'next/link';

import type { SafeToSpend } from '@moneytracker/core';

import { Card } from '@/components/card.tsx';
import { formatAmount } from '@/components/money.tsx';
import { formatShortDate } from '@/lib/format.ts';

/**
 * What can still be spent this month, with where the number comes from.
 *
 * The headline answers "can I afford this?"; the breakdown underneath shows
 * every part of it, so the number is never a mystery.
 */
export function SafeToSpendCard({ data }: { data: SafeToSpend }) {
  if (data.incomeBasis === 'none') {
    return (
      <Card title="Safe to spend" subtitle="This month">
        <p className="text-sm text-[var(--finance-muted)]">
          Safe to spend appears once some income is in: a paycheck this month, or in the last three
          months. Check that pay is categorized as income in the{' '}
          <Link href="/review" className="text-brand-600 hover:underline dark:text-brand-500">
            review inbox
          </Link>
          .
        </p>
      </Card>
    );
  }

  const over = data.overspent;
  const days = data.daysLeft === 1 ? 'today' : `for the next ${data.daysLeft} days`;

  return (
    <Card tone={over ? 'default' : 'brand'}>
      <div data-testid="safe-to-spend">
        <p className="finance-stat-label">Safe to spend this month</p>
        <p
          data-testid="safe-to-spend-amount"
          className={`mt-1.5 font-display text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl ${
            over ? 'text-rose-700 dark:text-rose-400' : ''
          }`}
        >
          {over ? `Over by ${formatAmount(-data.safeMinor)}` : formatAmount(data.safeMinor)}
        </p>
        <p className="finance-stat-meta mt-1.5 text-sm">
          {over
            ? 'Spending, bills and savings are already above the income expected this month.'
            : `That's about ${formatAmount(data.perDayMinor)} a day ${days}.`}
        </p>

        <details className="mt-3 text-sm">
          <summary className="finance-stat-meta cursor-pointer select-none font-medium">
            How this is worked out
          </summary>

          <dl className="mt-2 space-y-1.5 tabular-nums">
            <Line
              label={
                data.incomeBasis === 'this-month'
                  ? 'Income this month'
                  : `Income (${data.averageMonths}-month average)`
              }
              amountMinor={data.incomeMinor}
            />
            <Line label="Spent so far" amountMinor={-data.spentMinor} />
            {data.pendingMinor > 0 && (
              <Line label="Pending charges" amountMinor={-data.pendingMinor} />
            )}
            <Line label="Bills still due this month" amountMinor={-data.billsMinor} />
            {data.bills.map((bill) => (
              <Line
                key={`${bill.name}-${bill.date}`}
                label={`${bill.name} · ${formatShortDate(bill.date)}`}
                amountMinor={-bill.amountMinor}
                nested
              />
            ))}
            {data.savingsMinor > 0 && (
              <>
                <Line label="Set aside for goals" amountMinor={-data.savingsMinor} />
                {data.savings.map((goal) => (
                  <Line key={goal.name} label={goal.name} amountMinor={-goal.amountMinor} nested />
                ))}
              </>
            )}
            <div className="flex justify-between gap-3 border-t border-current/15 pt-1.5 font-semibold">
              <dt>Safe to spend</dt>
              <dd>{formatAmount(data.safeMinor)}</dd>
            </div>
          </dl>

          <p className="finance-stat-meta mt-2 text-xs">
            Bills come from{' '}
            <Link href="/subscriptions" className="underline">
              subscriptions
            </Link>{' '}
            and savings from{' '}
            <Link href="/goals" className="underline">
              goals
            </Link>
            . Transfers and card payments never count as spending.
          </p>
        </details>
      </div>
    </Card>
  );
}

/** One line of the breakdown. */
function Line({
  label,
  amountMinor,
  nested = false,
}: {
  label: string;
  amountMinor: number;
  nested?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${nested ? 'finance-stat-meta pl-3 text-xs' : ''}`}>
      <dt className={`min-w-0 ${nested ? 'truncate' : ''}`}>{label}</dt>
      {/* `|| 0` turns -0 into 0, so nothing reads "-$0.00". */}
      <dd className="shrink-0">{formatAmount(amountMinor || 0)}</dd>
    </div>
  );
}
