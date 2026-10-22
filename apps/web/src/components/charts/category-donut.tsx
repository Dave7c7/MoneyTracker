'use client';

import { useCallback, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { formatMoney, plainDateInMonth, type CategorySlice } from '@moneytracker/core';

import type { CategoryBreakdownView } from '@/lib/category-breakdown.ts';
import { formatMonth } from '@/lib/format.ts';
import { childOpacity, colorForGroup, OTHER_COLOR, withOpacity } from '@/lib/palette.ts';

/**
 * Where the month's money went, as a donut.
 *
 * The donut has two levels. The first one shows the groups, the second one
 * the categories inside the group that was opened. Tapping a category takes
 * the user to the transactions of that category, in the same month.
 */
export function CategoryDonut({
  initial,
  months,
  currency = 'USD',
  locale = 'en-US',
}: {
  initial: CategoryBreakdownView;
  months: string[];
  currency?: string;
  locale?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [month, setMonth] = useState(initial.month);
  const [stack, setStack] = useState<CategorySlice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The slices of the level that is on screen.
  const open = stack[stack.length - 1] ?? null;
  const slices = open ? (open.children ?? []) : view.slices;
  const levelTotal = open ? open.amountMinor : view.totalMinor;
  const levelTitle = open ? open.name : `${formatMonth(month, locale)} spending`;

  /** The colour of a slice of the level that is on screen. */
  const colorOf = useCallback(
    (slice: CategorySlice, index: number): string => {
      if (slice.colorKey === 'other') return OTHER_COLOR;
      const group = colorForGroup(slice.colorKey, view.colors);
      if (!open) return group;
      // Inside "Other" the members are groups of their own; inside a group
      // they are its categories, and they fade out from the group's hue.
      if (open.colorKey === 'other') return group;
      return withOpacity(group, childOpacity(index));
    },
    [open, view.colors],
  );

  /** Opens a slice, or takes the user to the transactions of a category. */
  const activate = useCallback(
    (slice: CategorySlice) => {
      if (slice.children && slice.children.length > 0) {
        setStack((current) => [...current, slice]);
        return;
      }
      if (!slice.categoryId) return;
      const from = plainDateInMonth(month, 1);
      const to = plainDateInMonth(month, 31);
      router.push(
        `/transactions?categoryId=${encodeURIComponent(slice.categoryId)}&from=${from}&to=${to}`,
      );
    },
    [month, router],
  );

  /** Goes one level up. */
  const goUp = useCallback(() => {
    setStack((current) => current.slice(0, -1));
  }, []);

  // Escape goes up as well, so the keyboard can leave the drill-down.
  useEffect(() => {
    if (stack.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') goUp();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goUp, stack.length]);

  /** Shows another month. */
  const changeMonth = useCallback(
    async (next: string) => {
      setMonth(next);
      setStack([]);
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/categories/breakdown?month=${next}`);
        if (!response.ok) throw new Error('The month could not be loaded');
        const result = (await response.json()) as CategoryBreakdownView;
        setView(result);
      } catch {
        // The old month stays on screen, so the selector has to say so too.
        setError('This month could not be loaded. Try again.');
        setMonth(view.month);
      }
      setLoading(false);
    },
    [view.month],
  );

  const hasSpending = view.totalMinor > 0 && slices.length > 0;
  const label = describe(slices, levelTitle, levelTotal, currency, locale);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {open ? (
          <button
            type="button"
            onClick={goUp}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            ‹ All categories
          </button>
        ) : (
          <span />
        )}

        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className="sr-only sm:not-sr-only">Month</span>
          <select
            value={month}
            onChange={(event) => changeMonth(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800"
          >
            {(months.length > 0 ? months : [month]).map((option) => (
              <option key={option} value={option}>
                {formatMonth(option, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
          {error}
        </p>
      )}

      <div className="relative h-[230px] w-full md:h-[280px]">
        {hasSpending ? (
          <div
            role="img"
            aria-label={label}
            className={`h-full ${loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={280}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="amountMinor"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="92%"
                  paddingAngle={1.2}
                  cornerRadius={3}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive={false}
                  onClick={(entry: unknown) => {
                    // Recharts hands the slice itself back, so a sector and
                    // its row always do the same thing.
                    const slice = entry as CategorySlice | undefined;
                    if (slice && typeof slice.amountMinor === 'number') activate(slice);
                  }}
                >
                  {slices.map((slice, index) => (
                    <Cell
                      key={slice.categoryId ?? 'other'}
                      fill={colorOf(slice, index)}
                      className="cursor-pointer outline-none"
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const slice = payload[0]?.payload as CategorySlice | undefined;
                    if (!slice) return null;
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {slice.name}
                        </p>
                        <p className="tabular text-slate-600 dark:text-slate-300">
                          {formatMoney(slice.amountMinor, currency, locale)} · {slice.percent}%
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <MutedRing
            message={
              loading ? 'Loading…' : error ? 'This month could not be loaded.' : 'No spending yet'
            }
          />
        )}

        {hasSpending && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="max-w-[9rem] text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {levelTitle}
            </p>
            <p className="tabular mt-0.5 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {formatMoney(levelTotal, currency, locale)}
            </p>
          </div>
        )}
      </div>

      {hasSpending ? (
        <ul className="mt-3 space-y-0.5">
          {slices.map((slice, index) => {
            const color = colorOf(slice, index);
            const drills = Boolean(slice.children && slice.children.length > 0);
            return (
              <li key={slice.categoryId ?? 'other'}>
                <button
                  type="button"
                  onClick={() => activate(slice)}
                  aria-label={`${slice.name}, ${formatMoney(slice.amountMinor, currency, locale)}, ${slice.percent} percent`}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1.5 py-2 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-slate-800/60"
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {slice.name}
                  </span>
                  <span className="tabular shrink-0 text-sm text-slate-700 dark:text-slate-200">
                    {formatMoney(slice.amountMinor, currency, locale)}
                  </span>
                  <span className="tabular w-11 shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
                    {slice.percent}%
                  </span>
                  {drills && (
                    <span aria-hidden="true" className="shrink-0 text-slate-400">
                      ›
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        !loading &&
        !error && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Nothing was spent in this month yet.{' '}
            <a
              href="/transactions"
              className="font-medium text-brand-600 hover:underline dark:text-brand-500"
            >
              See the transactions
            </a>
            .
          </p>
        )
      )}
    </div>
  );
}

/** The ring that stands in for a chart that has nothing to show. */
function MutedRing({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div
        aria-hidden="true"
        className="h-32 w-32 rounded-full border-[18px] border-slate-200 dark:border-slate-800"
      />
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

/** The sentence a screen reader reads for the chart. */
function describe(
  slices: readonly CategorySlice[],
  title: string,
  total: number,
  currency: string,
  locale: string,
): string {
  const parts = slices
    .slice(0, 4)
    .map((slice) => `${slice.name} ${formatMoney(slice.amountMinor, currency, locale)}`)
    .join(', ');
  return `${title}: ${formatMoney(total, currency, locale)}. ${parts}`;
}
