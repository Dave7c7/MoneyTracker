'use client';

import { useState } from 'react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMoney } from '@moneytracker/core';

import { formatMonth } from '@/lib/format.ts';

/** One category series in the chart. */
export interface SpendingSeries {
  categoryId: string;
  categoryName: string;
  monthly: number[];
}

/**
 * Spending by category over time, as a stacked bar chart.
 *
 * The data is aggregated in `core`; this component only renders it.
 */
export function SpendingByCategoryChart({
  months,
  categories,
  colors,
  currency,
  locale = 'en-US',
}: {
  months: string[];
  categories: SpendingSeries[];
  colors: Record<string, string>;
  currency: string;
  locale?: string;
}) {
  const data = months.map((month, index) => {
    const row: Record<string, string | number> = { month: formatMonth(month, locale) };
    for (const category of categories) {
      row[category.categoryName] = category.monthly[index] ?? 0;
    }
    return row;
  });

  // The last month in numbers, so the chart is not the only way to read them.
  const lastIndex = months.length - 1;
  const totals = categories
    .map((category) => ({
      name: category.categoryName,
      total: category.monthly[lastIndex] ?? 0,
    }))
    .filter((entry) => entry.total !== 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // A chart that cannot be sized is worth saying out loud, instead of leaving
  // an empty box on the screen.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  return (
    <>
      <div
        className="h-60 w-full md:h-72"
        role="img"
        aria-label={`Spending by category from ${months[0]} to ${months[months.length - 1]}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={280}
          onResize={(width) => setMeasuredWidth(width)}
        >
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-slate-200 dark:stroke-slate-800"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            className="fill-slate-500 dark:fill-slate-400"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            width={64}
            tickFormatter={(value: number) =>
              formatMoney(value, currency, locale).replace(/\.00$/, '')
            }
            className="fill-slate-500 dark:fill-slate-400"
          />
          <Tooltip
            cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <p className="mb-1 font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                  <ul className="space-y-1">
                    {payload
                      .filter((entry) => (entry.value as number) !== 0)
                      .map((entry) => (
                        <li key={String(entry.dataKey)} className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-slate-600 dark:text-slate-300">{entry.name}</span>
                          <span className="tabular ml-auto pl-3 font-medium text-slate-900 dark:text-slate-100">
                            {formatMoney(Number(entry.value), currency, locale)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              );
            }}
          />
          {categories.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="circle" iconSize={7} />
          )}
          {categories.map((category) => (
            <Bar
              key={category.categoryId}
              dataKey={category.categoryName}
              stackId="spending"
              fill={colors[category.categoryId] ?? '#94a3b8'}
              radius={[0, 0, 0, 0]}
            />
          ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {measuredWidth === 0 && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          This browser could not give the chart a size. The numbers are below.
        </p>
      )}

      {/*
        The chart is drawn by the browser, so a browser with no JavaScript
        shows nothing at all. The numbers are still there, and they are on the
        server.
      */}
      <noscript>
        <div className="mt-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
          <p className="font-medium text-slate-700 dark:text-slate-200">
            The chart needs JavaScript. Here is {formatMonth(months[lastIndex] ?? '', locale)}:
          </p>
          <ul className="mt-2 space-y-1">
            {totals.map((entry) => (
              <li key={entry.name} className="flex items-center justify-between gap-3">
                <span className="truncate text-slate-600 dark:text-slate-300">{entry.name}</span>
                <span className="tabular font-medium text-slate-900 dark:text-slate-100">
                  {formatMoney(entry.total, currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </noscript>
    </>
  );
}
