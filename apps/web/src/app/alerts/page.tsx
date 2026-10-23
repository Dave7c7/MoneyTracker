import { countUnreadAlerts, listAlerts } from '@moneytracker/db';

import { AlertsList } from '@/components/alerts-list.tsx';
import { Card } from '@/components/card.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Alerts' };

/**
 * What the app noticed and wants to say.
 *
 * The checker (`pnpm db:check-alerts`, meant for cron) writes these; this page
 * only reads them. A budget that is nearly used up, a connection that stopped
 * syncing, a large charge and a subscription that moved are the four things
 * worth interrupting a person for.
 */
export default async function AlertsPage() {
  const userId = await requireUser();
  const { db } = getDatabase();
  const env = getEnv();

  const [alerts, unread] = await Promise.all([
    listAlerts(db, userId, { limit: 100 }),
    countUnreadAlerts(db, userId),
  ]);

  const format = (date: Date) =>
    new Intl.DateTimeFormat(env.DEFAULT_LOCALE, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: env.APP_TIMEZONE,
    }).format(date);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Alerts</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {unread > 0 ? `${unread} new` : 'All read'}
        </span>
      </div>

      <Card
        title="Worth a look"
        subtitle="Budgets, connections, large charges and subscriptions — raised by the checker, not by a guess."
      >
        <AlertsList
          alerts={alerts.map((alert) => ({
            id: alert.id,
            kind: alert.kind,
            title: alert.title,
            body: alert.body,
            href: alert.href,
            createdAt: format(alert.createdAt),
            read: alert.readAt !== null,
          }))}
          unread={unread}
        />
      </Card>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Alerts are raised by <code>pnpm db:check-alerts</code>. Run it from cron after{' '}
        <code>pnpm db:sync</code>; set <code>ALERT_WEBHOOK_URL</code> to have the same sentence
        arrive on your phone. The README has the details.
      </p>
    </div>
  );
}
