/**
 * A titled panel. Every dashboard section uses this so spacing and contrast
 * stay consistent across both color schemes.
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
  return (
    <section
      className={`finance-card p-4 sm:p-5 ${tone === 'brand' ? 'finance-card--brand' : ''} ${className}`}
    >
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            {title && <h2 className="finance-card-title">{title}</h2>}
            {subtitle && <p className="finance-card-subtitle mt-1 text-xs">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
