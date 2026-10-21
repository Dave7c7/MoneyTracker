/**
 * A titled panel. Every dashboard section uses this so spacing and contrast
 * stay consistent.
 */
export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  tone = 'default',
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tone?: 'default' | 'brand';
}) {
  const tones = {
    default: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
    brand: 'border-slate-900 bg-slate-900 text-white dark:border-slate-800 dark:bg-slate-800',
  } as const;

  return (
    <section className={`rounded-2xl border p-3.5 shadow-sm sm:p-4 ${tones[tone]} ${className}`}>
      {(title || action) && (
        <div className="mb-2.5 flex items-start justify-between gap-3 sm:mb-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            )}
            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
