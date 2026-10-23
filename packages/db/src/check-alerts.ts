/**
 * Looks for alerts and sends the ones a webhook is waiting for.
 *
 * This is the part that makes an alert an alert rather than a screen you have
 * to remember to open: `cron` runs it after `pnpm db:sync`, the app stores what
 * it finds, and a webhook — ntfy, Home Assistant, a script — says it out loud.
 *
 * Running it twice is harmless. Every alert carries a key built from the fact,
 * and the database refuses a second one.
 *
 *   pnpm db:check-alerts
 */

import { getLocalUser } from './queries.ts';
import { deliverAlerts, evaluateAlerts } from './alerts.ts';
import { createDatabase } from './client.ts';
import { loadDotEnv, loadEnv } from './env.ts';

loadDotEnv();
const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

try {
  const user = await getLocalUser(db);
  if (!user) throw new Error('There is no user in this database yet. Run pnpm db:seed first.');

  const raised = await evaluateAlerts(db, user.id, {
    timeZone: env.APP_TIMEZONE,
    currency: env.DEFAULT_CURRENCY,
    locale: env.DEFAULT_LOCALE,
    largeTransactionMinor: env.ALERT_LARGE_TRANSACTION_MINOR,
  });

  if (raised.length === 0) {
    console.log('No new alerts.');
  } else {
    for (const alert of raised) console.log(`• ${alert.title} — ${alert.body}`);
    console.log(`${raised.length} new ${raised.length === 1 ? 'alert' : 'alerts'}.`);
  }

  if (env.ALERT_WEBHOOK_URL) {
    const result = await deliverAlerts(db, user.id, {
      url: env.ALERT_WEBHOOK_URL,
      baseUrl: env.APP_BASE_URL,
    });

    console.log(`Webhook: ${result.sent} sent, ${result.failed} failed.`);
    if (result.failed > 0) {
      // The alert is still there, and the next run tries again. A cron job that
      // exits non-zero on a flaky endpoint would only fill the mail with the
      // same sentence.
      console.warn('The webhook did not take every alert; the next run will try again.');
    }
  } else {
    console.log('No ALERT_WEBHOOK_URL is set, so the inbox is the only place they appear.');
  }
} finally {
  await pool.end();
}
