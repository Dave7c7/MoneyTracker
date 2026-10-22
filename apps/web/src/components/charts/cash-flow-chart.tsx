'use client';

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

/** One month of cash flow. */
export interface CashFlowEntry {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

/**
 * Income against expenses per month, with the net savings line.
 */
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

  return (
    <div className="h-60 w-full md:h-72" role="img" aria-label="Income and expenses per month">
      <ResponsiveContainer width="100%" height="100%" minWidth={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            yAxisId="amount"
            tick={{ fontSize: 11 }}
            width={64}
            tickFormatter={(value: number) =>
              formatMoney(value, currency, locale).replace(/\.00$/, '')
            }
            className="fill-slate-500 dark:fill-slate-400"
          />
          <YAxis
            yAxisId="net"
            orientation="right"
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
                    {payload.map((entry) => (
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
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          <Bar
            yAxisId="amount"
            dataKey="income"
            name="Income"
            fill="#22c55e"
            radius={[3, 3, 0, 0]}
          />
          <Bar
            yAxisId="amount"
            dataKey="expenses"
            name="Expenses"
            fill="#f43f5e"
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="net"
            type="monotone"
            dataKey="net"
            name="Net"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
