'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** An alert, as the inbox shows it. */
export interface AlertSummary {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  /** Already formatted for the screen. */
  createdAt: string;
  read: boolean;
}

/** The kind, in a word a person would use. */
const KIND_LABELS: Record<string, string> = {
  budget: 'Budget',
  sync: 'Connection',
  'large-transaction': 'Charge',
  recurring: 'Subscription',
};

/**
 * The alerts themselves.
 *
 * Reading is a button rather than a side effect of looking: an alert stays new
 * until the person says they have seen it, and the header count follows. The
 * list is short on purpose — it is what the app noticed, not a history of
 * everything that ever happened.
 */
export function AlertsList({ alerts, unread }: { alerts: AlertSummary[]; unread: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mark(body: { action: 'read'; id: string } | { action: 'read-all' }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? 'That did not work.');
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (alerts.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        Nothing needs your attention. The checker (<code>pnpm db:check-alerts</code>) looks at
        budgets, connections, charges and subscriptions; when it finds something, it appears here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {unread > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {unread} {unread === 1 ? 'alert is' : 'alerts are'} new.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void mark({ action: 'read-all' })}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
          >
            Mark all as read
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-2.5 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200"
        >
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className={`rounded-xl border p-3 ${
              alert.read
                ? 'border-slate-200 bg-white opacity-70 dark:border-slate-800 dark:bg-slate-900'
                : 'border-amber-300 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/40'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {KIND_LABELS[alert.kind] ?? alert.kind}
                {!alert.read && (
                  <span className="ml-2 text-amber-600 dark:text-amber-400">New</span>
                )}
              </p>
              <time className="text-[11px] text-slate-400 dark:text-slate-500">
                {alert.createdAt}
              </time>
            </div>

            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {alert.title}
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{alert.body}</p>

            <div className="mt-2 flex items-center gap-3">
              {alert.href && (
                <Link
                  href={alert.href}
                  className="text-xs font-medium text-sky-700 underline dark:text-sky-300"
                >
                  Open
                </Link>
              )}
              {!alert.read && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void mark({ action: 'read', id: alert.id })}
                  className="text-xs font-medium text-slate-500 underline disabled:opacity-50 dark:text-slate-400"
                >
                  Mark read
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
