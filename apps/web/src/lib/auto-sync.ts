/**
 * The app's own sync scheduler.
 *
 * A self-hosted install used to need a cron line on the host to sync its bank
 * connections; without one, nothing synced and nothing said so. The app now
 * checks every few minutes and syncs each connection once its refresh interval
 * has passed (see `connectionsDue`). A cron line still works: the syncs share a
 * database lock, so two never run at once.
 *
 * Started from `instrumentation.ts`, on the Node.js runtime only.
 */

import 'server-only';

import { getLocalUser, requireEncryptionKey, syncDueConnections } from '@moneytracker/db';

import { getDatabase } from './db.ts';
import { getEnv } from './env.ts';

/** How long after the server starts the first check runs. */
const FIRST_CHECK_MS = 60_000;
/** How often the scheduler checks for connections that are due. */
const CHECK_EVERY_MS = 15 * 60_000;

const globalForScheduler = globalThis as unknown as { moneyTrackerAutoSync?: boolean };

/**
 * Starts the scheduler, once per process.
 *
 * Does nothing when `AUTO_SYNC` is off or no `ENCRYPTION_KEY` is set (there
 * can be no connection to sync without one).
 */
export function startAutoSync(): void {
  if (globalForScheduler.moneyTrackerAutoSync) return;

  const env = getEnv();
  if (!env.AUTO_SYNC) {
    console.warn('[auto-sync] Off (AUTO_SYNC=false). Bank connections sync only when asked.');
    return;
  }

  let keyHex: string;
  try {
    keyHex = requireEncryptionKey(env.ENCRYPTION_KEY);
  } catch {
    console.warn('[auto-sync] Off: ENCRYPTION_KEY is not set, so there is nothing to sync.');
    return;
  }

  globalForScheduler.moneyTrackerAutoSync = true;
  const lastAttempts = new Map<string, Date>();
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { db } = getDatabase();
      const user = await getLocalUser(db);
      if (!user) return;

      const outcome = await syncDueConnections(db, user.id, keyHex, { lastAttempts });
      // Only failures are logged; the connections page shows every sync.
      if (outcome && outcome.failed > 0) {
        console.warn(
          `[auto-sync] ${outcome.failed} connection(s) failed to sync; see the connections page.`,
        );
      }
    } catch (error) {
      // The message of a sync failure never holds the credential; it is the
      // same text that is stored on the connection.
      console.error(
        `[auto-sync] The check failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      running = false;
    }
  };

  setTimeout(() => void tick(), FIRST_CHECK_MS).unref();
  setInterval(() => void tick(), CHECK_EVERY_MS).unref();
}
