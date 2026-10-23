/**
 * The scratch database the tests use.
 *
 * The database tests truncate tables between cases, so they must never point at
 * a database with anything real in it, and two runs must never share one: each
 * run would empty the tables under the other, and the failures look like
 * broken tests rather than like a collision.
 *
 * This file is what makes both of those safe:
 *
 * - `ensureTestDatabase` creates the database if it is missing and applies the
 *   migrations, so a fresh checkout needs one command, not a list of steps.
 * - `acquireTestDatabaseLock` takes a Postgres advisory lock for the run. A
 *   second run against the same database fails immediately, with a sentence
 *   that says so, instead of producing thirty-eight nonsense failures.
 * - `assertTestDatabaseUrl` refuses a database whose name does not end in
 *   `_test`, so a stray environment variable cannot wipe the development data.
 *
 * It talks to Postgres directly rather than through the app's client, because
 * the app's client reads and validates the app's environment, and this runs
 * before the tests have one.
 */

import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';

/** The database the tests use when nothing says otherwise. */
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test';

/** The database the end-to-end tests use when nothing says otherwise. */
export const DEFAULT_E2E_DATABASE_URL =
  'postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_e2e';

/** Where the migrations live, relative to this file. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * The test database address: the environment's, or the local default.
 *
 * @example
 * const url = resolveTestDatabaseUrl(); // TEST_DATABASE_URL ?? the default
 */
export function resolveTestDatabaseUrl(): string {
  const fromEnvironment = process.env.TEST_DATABASE_URL?.trim();
  return fromEnvironment && fromEnvironment.length > 0
    ? fromEnvironment
    : DEFAULT_TEST_DATABASE_URL;
}

/**
 * Refuses a database that is not clearly a scratch one.
 *
 * Truncating the development database because a variable pointed at it is the
 * kind of accident that cannot be undone, so the name has to end in `_test` or
 * `_e2e`.
 *
 * @example
 * assertTestDatabaseUrl('postgresql://.../moneytracker'); // throws
 */
export function assertTestDatabaseUrl(url: string): void {
  const name = databaseName(url);
  if (!/_(test|e2e)\d*$/.test(name)) {
    throw new Error(
      `The test database must be named so it is obviously scratch, ending in "_test", ` +
        `"_test2", "_e2e" and so on. This one is "${name}". Point the variable at something ` +
        `like ${DEFAULT_TEST_DATABASE_URL}, or run pnpm db:test:setup.`,
    );
  }
}

/**
 * Creates the database if it is missing and applies the migrations.
 *
 * Safe to run as often as you like: an existing database is left alone, and the
 * migrations are the same ones the app runs.
 *
 * @example
 * const report = await ensureTestDatabase(resolveTestDatabaseUrl());
 * report.created; // true the first time
 */
export async function ensureTestDatabase(url: string): Promise<{
  created: boolean;
  migrated: boolean;
  url: string;
}> {
  assertTestDatabaseUrl(url);

  const created = (await createDatabaseIfMissing(url)) !== null;

  // The database exists now; the migrations are the same ones the app runs.
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }

  return { created, migrated: true, url };
}

/**
 * Takes the lock that keeps two test runs off one database.
 *
 * The lock belongs to a connection, so a run that crashes releases it when the
 * connection dies: there is nothing to clean up by hand.
 *
 * @example
 * const guard = await acquireTestDatabaseLock(url);
 * await guard.release();
 */
export async function acquireTestDatabaseLock(
  url: string,
  label = 'the tests',
): Promise<{ release: () => Promise<void> }> {
  const client = new Client({ connectionString: url });
  await client.connect();

  const result = await client.query<{ locked: boolean }>(
    'select pg_try_advisory_lock(727001, hashtext(current_database())) as locked',
  );

  if (!result.rows[0]?.locked) {
    await client.end();
    throw new Error(
      `${capitalise(label)} are already running against ${databaseName(url)}. They empty tables ` +
        'between cases, so two runs at once produce failures that look like broken tests. ' +
        'Wait for the other run to finish, or give this one its own TEST_DATABASE_URL.',
    );
  }

  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query('select pg_advisory_unlock(727001, hashtext(current_database()))');
      } finally {
        await client.end();
      }
    },
  };
}

/** The name of the database in a connection string. */
export function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '') || '(none)';
  } catch {
    return '(unreadable address)';
  }
}

/**
 * Creates the database, or returns null when it was already there.
 *
 * `CREATE DATABASE` cannot run inside a transaction and cannot run in the
 * database being created, so this connects to the maintenance database.
 */
async function createDatabaseIfMissing(url: string): Promise<string | null> {
  const name = databaseName(url);
  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = '/postgres';

  const client = new Client({ connectionString: maintenanceUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query<{ exists: boolean }>(
      'select exists (select 1 from pg_database where datname = $1) as exists',
      [name],
    );
    if (existing.rows[0]?.exists) return null;

    // The name comes from the URL, and it is quoted as an identifier: it is
    // not interpolated as SQL.
    try {
      await client.query(`create database ${quoteIdentifier(name)}`);
    } catch (error) {
      // Another run may have created it between the check and the statement.
      if ((error as { code?: string }).code !== '42P04') throw error;
      return null;
    }
    return name;
  } finally {
    await client.end();
  }
}

/** Quotes a Postgres identifier, doubling any quote inside it. */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** A capital first letter, for a sentence that starts with a label. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
