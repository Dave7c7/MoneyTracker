'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMoney } from '@moneytracker/core';

import { formatMonth } from '@/lib/format.ts';
import { chartAxisTick, chartColors, ChartTooltip } from './chart-ui.tsx';

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
    <div className="h-64 w-full md:h-80" role="img" aria-label="Net worth over time">
      <ResponsiveContainer width="100%" height="100%" minWidth={280}>
        <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="net-worth-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--finance-accent-bright)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--finance-accent-bright)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
          <ReferenceLine y={0} stroke={chartColors.reference} strokeDasharray="4 5" />
          <Tooltip
            cursor={{ stroke: 'var(--finance-border-strong)', strokeDasharray: '3 4' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as
                { net: number; assets: number; liabilities: number } | undefined;
              if (!point) return null;
              return (
                <ChartTooltip
                  title={label}
                  entries={[
                    {
                      key: 'net',
                      name: 'Net worth',
                      value: formatMoney(point.net, currency, locale),
                      color: 'var(--finance-accent-bright)',
                    },
                    {
                      key: 'assets',
                      name: 'Assets',
                      value: formatMoney(point.assets, currency, locale),
                    },
                    {
                      key: 'liabilities',
                      name: 'Liabilities',
                      value: formatMoney(point.liabilities, currency, locale),
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="net"
            name="Net worth"
            stroke="var(--finance-accent-bright)"
            strokeWidth={2.5}
            fill="url(#net-worth-fill)"
            dot={false}
            activeDot={{
              r: 4,
              fill: 'var(--finance-accent-bright)',
              stroke: 'var(--finance-surface)',
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
