/**
 * Syncs every connection from the command line.
 *
 * A self-hosted app has no scheduler of its own, so the sync is a command:
 * put it in cron and the connections are refreshed every day.
 *
 *   17 7 * * *  cd /app && pnpm sync >> /var/log/moneytracker-sync.log 2>&1
 *
 * The minute is not on the hour on purpose: the provider asks for that.
 */

import { getLocalUser } from './queries.ts';
import { createDatabase } from './client.ts';
import { loadDotEnv, loadEnv } from './env.ts';
import { requireEncryptionKey } from './credentials.ts';
import { syncAllConnections } from './connections.ts';

loadDotEnv();
const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

try {
  const user = await getLocalUser(db);
  if (!user) throw new Error('There is no user in this database yet.');

  const key = requireEncryptionKey(env.ENCRYPTION_KEY);
  const outcome = await syncAllConnections(db, user.id, key);

  console.log(`Synced ${outcome.synced} connections, ${outcome.failed} failed.`);
  if (outcome.failed > 0) process.exitCode = 1;
} finally {
  await pool.end();
}
