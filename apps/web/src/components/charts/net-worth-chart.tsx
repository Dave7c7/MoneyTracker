'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMoney } from '@moneytracker/core';

import { formatMonth } from '@/lib/format.ts';

/** Net worth at the end of one month. */
export interface NetWorthPoint {
  month: string;
  assetsMinor: number;
  liabilitiesMinor: number;
  netMinor: number;
}

/**
 * Net worth over time, from the balance snapshots.
 *
 * The line is the net worth: what the accounts hold minus what is owed. The
 * tooltip says where it comes from.
 */
export function NetWorthChart({
  points,
  currency,
  locale = 'en-US',
}: {
  points: NetWorthPoint[];
  currency: string;
  locale?: string;
}) {
  const data = points.map((point) => ({
    month: formatMonth(point.month, locale),
    net: point.netMinor,
    assets: point.assetsMinor,
    liabilities: point.liabilitiesMinor,
  }));

  return (
    <div className="h-60 w-full md:h-72" role="img" aria-label="Net worth over time">
      <ResponsiveContainer width="100%" height="100%" minWidth={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as
                { net: number; assets: number; liabilities: number } | undefined;
              if (!point) return null;
              return (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <p className="mb-1 font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                  <p className="tabular text-slate-600 dark:text-slate-300">
                    Net worth {formatMoney(point.net, currency, locale)}
                  </p>
                  <p className="tabular text-slate-600 dark:text-slate-300">
                    Assets {formatMoney(point.assets, currency, locale)}
                  </p>
                  <p className="tabular text-slate-600 dark:text-slate-300">
                    Liabilities {formatMoney(point.liabilities, currency, locale)}
                  </p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="net"
            name="Net worth"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
