/** The shared heading rhythm for every finance screen. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-[var(--finance-border)] pb-4">
      <div className="min-w-0">
        <p className="finance-eyebrow">{eyebrow}</p>
        <h2 className="finance-page-title mt-1.5">{title}</h2>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--finance-muted)]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
