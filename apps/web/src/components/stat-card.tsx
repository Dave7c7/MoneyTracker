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
  className = '',
}: {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'flat'; positive: boolean };
  hint?: string;
  tone?: 'neutral' | 'brand';
  className?: string;
}) {
  const brand = tone === 'brand';

  return (
    <Card tone={brand ? 'brand' : 'default'} className={className}>
      <p className="finance-stat-label">{label}</p>
      <p className="finance-stat-value mt-1.5">{value}</p>

      {delta && (
        <p
          className={`mt-1.5 text-xs font-medium ${
            brand
              ? 'finance-stat-meta'
              : delta.positive
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
          }`}
        >
          {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'} {delta.value}
        </p>
      )}

      {hint && <p className="finance-stat-meta mt-1.5 text-xs">{hint}</p>}
    </Card>
  );
}
