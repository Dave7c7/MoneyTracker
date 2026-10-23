/**
 * Sets up the scratch database the tests use.
 *
 * One command, from nothing:
 *
 *   pnpm db:test:setup
 *
 * It creates the database if it is missing, applies the migrations, and says
 * what it found. `pnpm test` does the same thing on its own, so this is for
 * when you want to see it happen, or to prepare a machine before a long run.
 */

import {
  acquireTestDatabaseLock,
  assertTestDatabaseUrl,
  databaseName,
  ensureTestDatabase,
  resolveTestDatabaseUrl,
} from './test-database.ts';

const url = resolveTestDatabaseUrl();

assertTestDatabaseUrl(url);
console.log(`Test database: ${databaseName(url)} at ${safeAddress(url)}`);

// Create and migrate first: the lock lives in the database it protects.
const report = await ensureTestDatabase(url);
const guard = await acquireTestDatabaseLock(url, 'the setup');
try {
  console.log(`  created:  ${report.created ? 'yes' : 'already there'}`);
  console.log(`  migrated: ${report.migrated ? 'yes' : 'no'}`);
  console.log('Ready. Run the tests with: pnpm test');
} finally {
  await guard.release();
}

/** The address without the password, for a line a person reads. */
function safeAddress(address: string): string {
  try {
    const parsed = new URL(address);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(unreadable address)';
  }
}
