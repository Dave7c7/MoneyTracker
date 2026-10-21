/** The palette used when a category has no colour of its own. */
const PALETTE = [
  '#0ea5e9',
  '#f97316',
  '#a855f7',
  '#14b8a6',
  '#eab308',
  '#ec4899',
  '#f43f5e',
  '#6366f1',
  '#22c55e',
  '#8b5cf6',
  '#0f766e',
  '#b45309',
];

/** Where an assignment came from, in words a person understands. */
const SOURCE_LABELS: Record<string, string> = {
  user_manual: 'You',
  user_rule: 'Your rule',
  merchant_memory: 'Remembered',
  bank: 'Bank',
  ai: 'AI',
  fallback: 'Needs review',
};

/**
 * A category pill with the source of the assignment.
 *
 * @example
 * <CategoryPill name="Groceries" color="#f97316" source="bank" confidence={0.7} />
 */
export function CategoryPill({
  name,
  color,
  source,
  confidence,
}: {
  name: string;
  color?: string | null;
  source?: string | null;
  confidence?: number | null;
}) {
  const label = source ? (SOURCE_LABELS[source] ?? source) : null;
  const needsReview =
    source === 'fallback' || (confidence !== null && confidence !== undefined && confidence < 0.8);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: color ?? '#94a3b8' }}
      />
      {name}
      {label && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            needsReview
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          }`}
          title={
            confidence !== null && confidence !== undefined
              ? `Confidence ${Math.round(confidence * 100)}%`
              : undefined
          }
        >
          {label}
        </span>
      )}
    </span>
  );
}

/**
 * Picks a stable colour for a category name.
 *
 * @example
 * colorForName('Groceries'); // "#0ea5e9"
 */
export function colorForName(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length]!;
}
