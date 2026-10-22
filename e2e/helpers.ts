/**
 * Helpers for the end-to-end tests.
 *
 * The projects share one database, so a test that changes data has to put it
 * back. These helpers do that from the database side, which is the only
 * place that can undo a change cleanly.
 *
 * The database package is imported from its source, because the tests run
 * outside the workspace packages and would otherwise not find it.
 */

import { createDatabase, getLocalUser, removeImportedRows } from '../packages/db/src/index.ts';

/** The database the end-to-end tests use. */
function databaseUrl(): string | undefined {
  return process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
}

/**
 * Removes everything an import brought in: the transactions, the account and
 * the profile.
 *
 * @example
 * await removeImportedData();
 */
export async function removeImportedData(): Promise<void> {
  const url = databaseUrl();
  if (!url) return;

  const { db, pool } = createDatabase(url);
  try {
    const user = await getLocalUser(db);
    if (user) await removeImportedRows(db, user.id);
  } finally {
    await pool.end();
  }
}
