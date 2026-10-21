/**
 * The database client.
 *
 * Next.js reloads modules in development, so the pool is cached on the global
 * object to avoid opening a new pool on every reload.
 */

import 'server-only';

import { createDatabase } from '@moneytracker/db';

import { getEnv } from './env.ts';

interface DatabaseHandle {
  db: ReturnType<typeof createDatabase>['db'];
  pool: ReturnType<typeof createDatabase>['pool'];
}

const globalForDatabase = globalThis as unknown as { moneyTrackerDatabase?: DatabaseHandle };

/**
 * Returns the shared database handle.
 *
 * @example
 * const { db } = getDatabase();
 */
export function getDatabase(): DatabaseHandle {
  if (!globalForDatabase.moneyTrackerDatabase) {
    globalForDatabase.moneyTrackerDatabase = createDatabase(getEnv().DATABASE_URL);
  }
  return globalForDatabase.moneyTrackerDatabase;
}
