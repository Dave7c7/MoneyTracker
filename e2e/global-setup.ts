/**
 * Prepares the end-to-end database.
 *
 * The end-to-end tests change data, so they run against their own scratch
 * database. It is created and migrated if it is missing, reset before every
 * run, and given a password: the app starts closed, so the setup also saves the
 * signed-in cookie every test starts from, and the few tests that are about
 * signing in opt out.
 *
 * The lock is taken here and held for the whole run — it is never released on
 * purpose. Two suites against one database would reset each other's data
 * halfway through, and the failures would look like broken tests. The lock
 * belongs to a connection that ends with the process, so a crashed run frees it
 * on its own.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { request } from '@playwright/test';

import { E2E_PASSWORD, E2E_STATE_PATH } from './auth.ts';
import {
  acquireTestDatabaseLock,
  assertTestDatabaseUrl,
  databaseName,
  DEFAULT_E2E_DATABASE_URL,
  ensureTestDatabase,
} from '../packages/db/src/test-database.ts';

export default async function globalSetup() {
  const databaseUrl = process.env.E2E_DATABASE_URL?.trim() || DEFAULT_E2E_DATABASE_URL;
  process.env.E2E_DATABASE_URL = databaseUrl;

  assertTestDatabaseUrl(databaseUrl);

  // Create and migrate before anything else, so a fresh machine needs no
  // manual database step. Then take the lock: the lock lives in the database.
  await ensureTestDatabase(databaseUrl);
  await acquireTestDatabaseLock(databaseUrl, 'the end-to-end tests');

  execFileSync('pnpm', ['db:reset'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  console.log(`End-to-end database reset: ${databaseName(databaseUrl)}`);

  const baseUrl = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? '3100'}`;

  const context = await request.newContext({ baseURL: baseUrl });
  try {
    // A fresh database has no password: this claims it. A database that
    // already has one (a server the tests were pointed at) is signed in to.
    const claimed = await context.post('/api/auth/setup', { data: { password: E2E_PASSWORD } });

    if (claimed.status() === 409) {
      const signedIn = await context.post('/api/auth/login', {
        data: { email: 'you@example.com', password: E2E_PASSWORD },
      });
      if (!signedIn.ok()) {
        throw new Error(
          `The test server is password protected and "${E2E_PASSWORD}" does not open it.`,
        );
      }
    } else if (!claimed.ok()) {
      throw new Error(
        `Could not set the test password: ${claimed.status()} ${await claimed.text()}`,
      );
    }

    mkdirSync(dirname(E2E_STATE_PATH), { recursive: true });
    await context.storageState({ path: E2E_STATE_PATH });
  } finally {
    await context.dispose();
  }
}
