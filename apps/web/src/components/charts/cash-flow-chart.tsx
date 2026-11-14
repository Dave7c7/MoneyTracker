'use client';

import { useState } from 'react';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMoney } from '@moneytracker/core';

import { formatMonth } from '@/lib/format.ts';
import { chartAxisTick, chartColors, chartLegendStyle, ChartTooltip } from './chart-ui.tsx';

/** One month of cash flow. */
export interface CashFlowEntry {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

/** Income against expenses per month, with the net savings line. */
export function CashFlowChart({
  entries,
  currency,
  locale = 'en-US',
}: {
  entries: CashFlowEntry[];
  currency: string;
  locale?: string;
}) {
  const data = entries.map((entry) => ({
    month: formatMonth(entry.month, locale),
    income: entry.incomeMinor,
    expenses: entry.expenseMinor,
    net: entry.netMinor,
  }));

  // A chart that cannot be sized is worth saying out loud, instead of leaving
  // an empty box on the screen.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);

  const last = entries[entries.length - 1];

  return (
    <>
      <div className="h-64 w-full md:h-80" role="img" aria-label="Income and expenses per month">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={280}
          onResize={(width) => setMeasuredWidth(width)}
        >
          <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
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
              yAxisId="amount"
              tick={chartAxisTick}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) =>
                formatMoney(value, currency, locale).replace(/\.00$/, '')
              }
            />
            <YAxis
              yAxisId="net"
              orientation="right"
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
                    entries={payload.map((entry) => ({
                      key: String(entry.dataKey),
                      name: String(entry.name),
                      value: formatMoney(Number(entry.value), currency, locale),
                      color: entry.color,
                    }))}
                  />
                );
              }}
            />
            <Legend
              wrapperStyle={chartLegendStyle}
              iconType="circle"
              iconSize={7}
              formatter={(value: string) => (
                <span style={{ color: 'var(--finance-muted)' }}>{value}</span>
              )}
            />
            <Bar
              yAxisId="amount"
              dataKey="income"
              name="Income"
              fill={chartColors.income}
              maxBarSize={30}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="amount"
              dataKey="expenses"
              name="Expenses"
              fill={chartColors.expenses}
              maxBarSize={30}
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="net"
              type="monotone"
              dataKey="net"
              name="Net"
              stroke={chartColors.net}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: chartColors.net, stroke: 'var(--finance-surface)' }}
            />
          </ComposedChart>
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
        {last && (
          <div className="mt-2 rounded-xl border border-[var(--finance-border)] p-3 text-sm">
            <p className="font-medium text-[var(--finance-ink)]">
              The chart needs JavaScript. Here is {formatMonth(last.month, locale)}:
            </p>
            <ul className="mt-2 space-y-1">
              {[
                ['Income', last.incomeMinor],
                ['Expenses', last.expenseMinor],
                ['Net', last.netMinor],
              ].map(([name, value]) => (
                <li key={name} className="flex items-center justify-between gap-3">
                  <span className="text-[var(--finance-muted)]">{name}</span>
                  <span className="tabular font-medium text-[var(--finance-ink)]">
                    {formatMoney(Number(value), currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </noscript>
    </>
  );
}
