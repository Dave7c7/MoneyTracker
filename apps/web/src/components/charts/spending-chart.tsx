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
import { chartAxisTick, chartLegendStyle, ChartTooltip } from './chart-ui.tsx';

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
        className="h-64 w-full md:h-80"
        role="img"
        aria-label={`Spending by category from ${months[0]} to ${months[months.length - 1]}`}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={280}
          onResize={(width) => setMeasuredWidth(width)}
        >
          <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--finance-border)" strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="month"
              tick={chartAxisTick}
              tickLine={false}
              axisLine={false}
              dy={8}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={chartAxisTick}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) =>
                formatMoney(value, currency, locale).replace(/\.00$/, '')
              }
            />
            <Tooltip
              cursor={{ fill: 'var(--finance-accent-soft)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <ChartTooltip
                    title={label}
                    entries={payload
                      .filter((entry) => Number(entry.value) !== 0)
                      .map((entry) => ({
                        key: String(entry.dataKey),
                        name: String(entry.name),
                        value: formatMoney(Number(entry.value), currency, locale),
                        color: entry.color,
                      }))}
                  />
                );
              }}
            />
            {categories.length > 1 && (
              <Legend
                wrapperStyle={chartLegendStyle}
                iconType="circle"
                iconSize={7}
                formatter={(value: string) => (
                  <span style={{ color: 'var(--finance-muted)' }}>{value}</span>
                )}
              />
            )}
            {categories.map((category, index) => (
              <Bar
                key={category.categoryId}
                dataKey={category.categoryName}
                stackId="spending"
                fill={colors[category.categoryId] ?? '#94a3b8'}
                maxBarSize={38}
                radius={index === categories.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
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
        <div className="mt-2 rounded-xl border border-[var(--finance-border)] p-3 text-sm">
          <p className="font-medium text-[var(--finance-ink)]">
            The chart needs JavaScript. Here is {formatMonth(months[lastIndex] ?? '', locale)}:
          </p>
          <ul className="mt-2 space-y-1">
            {totals.map((entry) => (
              <li key={entry.name} className="flex items-center justify-between gap-3">
                <span className="truncate text-[var(--finance-muted)]">{entry.name}</span>
                <span className="tabular font-medium text-[var(--finance-ink)]">
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
