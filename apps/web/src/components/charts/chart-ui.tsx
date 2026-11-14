import type { CSSProperties } from 'react';

/** Shared chart presentation. Data and category colors stay with each chart. */
export const chartAxisTick = {
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  fill: 'var(--finance-muted)',
} as const;

export const chartLegendStyle: CSSProperties = {
  color: 'var(--finance-muted)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  paddingTop: 12,
};

export const chartColors = {
  income: 'var(--finance-accent-bright)',
  expenses: '#fb7185',
  net: '#a88bff',
  reference: 'var(--finance-faint)',
} as const;

export type ChartTooltipEntry = {
  key: string;
  name: string;
  value: string;
  color?: string;
};

/** A quiet, readable tooltip shared by every finance chart. */
export function ChartTooltip({
  title,
  entries,
}: {
  title: React.ReactNode;
  entries: ChartTooltipEntry[];
}) {
  return (
    <div className="finance-chart-tooltip">
      <p className="finance-chart-tooltip__title">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {entries.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2 text-xs">
            {entry.color && (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
            )}
            <span className="text-[var(--finance-muted)]">{entry.name}</span>
            <span className="tabular ml-auto pl-4 font-medium text-[var(--finance-ink)]">
              {entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
