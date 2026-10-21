import { Card } from './card.tsx';

/**
 * A headline number with an optional comparison.
 */
export function StatCard({
  label,
  value,
  delta,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; positive: boolean };
  hint?: string;
  tone?: 'neutral' | 'brand';
}) {
  return (
    <Card className={tone === 'brand' ? 'bg-slate-900 text-white dark:bg-slate-800' : ''}>
      <p
        className={`text-xs font-medium uppercase tracking-wide ${
          tone === 'brand' ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {label}
      </p>
      <p
        className={`tabular mt-1 text-2xl font-semibold tracking-tight ${
          tone === 'brand' ? 'text-white' : 'text-slate-900 dark:text-slate-100'
        }`}
      >
        {value}
      </p>

      {delta && (
        <p
          className={`mt-1 text-xs font-medium ${
            tone === 'brand'
              ? 'text-slate-300'
              : delta.positive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'} {delta.value}
        </p>
      )}

      {hint && (
        <p
          className={`mt-1 text-xs ${
            tone === 'brand' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {hint}
        </p>
      )}
    </Card>
  );
}
