/**
 * Prepares the end-to-end database.
 *
 * The end-to-end tests change data, so they run against their own scratch
 * database, reset before every run. The app starts closed, so the setup also
 * gives it a password and saves the signed-in cookie: every test then starts
 * signed in, and the few tests that are about signing in opt out.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { request } from '@playwright/test';

import { E2E_PASSWORD, E2E_STATE_PATH } from './auth.ts';

export default async function globalSetup() {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (databaseUrl) {
    execFileSync('pnpm', ['db:reset'], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  }

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
