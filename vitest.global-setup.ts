/**
 * Prepares the database the tests use, once per run.
 *
 * Two things happen here, and both are about not being surprised later:
 *
 * 1. The test database is created if it is missing and migrated, so a fresh
 *    checkout needs one command (`pnpm test`), not a list of steps.
 * 2. A Postgres advisory lock is held for the whole run. A second run against
 *    the same database stops immediately with a sentence that explains itself,
 *    because the tests truncate tables and two runs at once produce failures
 *    that look like broken code.
 *
 * The default address is set in `vitest.config.ts`, so the test files, this
 * setup and the workers all read the same value.
 */

import {
  acquireTestDatabaseLock,
  ensureTestDatabase,
  resolveTestDatabaseUrl,
} from './packages/db/src/test-database.ts';

export default async function setup() {
  const url = resolveTestDatabaseUrl();

  // The database has to exist before the lock can live in it.
  await ensureTestDatabase(url);
  const guard = await acquireTestDatabaseLock(url);

  // The lock is released when the run ends. It also goes away by itself if the
  // process dies, because it belongs to a connection.
  return async () => {
    await guard.release();
  };
}
