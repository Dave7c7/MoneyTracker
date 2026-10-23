import { defineConfig, devices } from '@playwright/test';

import { E2E_STATE_PATH } from './e2e/auth.ts';
import { DEFAULT_E2E_DATABASE_URL } from './packages/db/src/test-database.ts';

/**
 * End-to-end configuration.
 *
 * The suite is deliberately small and stable: it checks that the app starts,
 * that the dashboards render the seeded numbers, and that filtering works.
 *
 * The tests run against a production build on their own port, in their own
 * build directory. A development server watches the repository and reloads
 * whenever a file changes, which would reload the browser mid-test (and would
 * disturb a development server that is already running).
 */

/** The port the test server listens on. */
const port = process.env.E2E_PORT ?? '3100';

/** Where the test build goes. */
const distDir = '.next-e2e';

/** The address the tests use. */
const baseUrl = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

/*
  The end-to-end tests have their own database, with a default so the suite runs
  on a fresh machine with nothing to configure. It is created, migrated and
  reset by the global setup; the name ends in `_e2e` so it can never be the
  development database.
*/
const e2eDatabaseUrl = process.env.E2E_DATABASE_URL?.trim() || DEFAULT_E2E_DATABASE_URL;

export default defineConfig({
  testDir: './e2e',
  // Every run starts from a clean database, so the tests never depend on
  // what a previous run left behind.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: baseUrl,
    trace: 'retain-on-failure',
    // The global setup sets the password and signs in once; the tests start
    // from that cookie. The sign-in tests opt out of it.
    storageState: E2E_STATE_PATH,
  },
  projects: [
    {
      // The narrowest width the app has to support.
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 780 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      // Pixel 10 Pro XL: 6.8 inch, 1344 x 2992 at 3x, so 448 x 997 CSS pixels.
      name: 'pixel',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 448, height: 997 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        /*
          The readiness probe must not need the database.

          The database is created and reset by the global setup, and Playwright
          starts the web server before it runs the global setup. A probe that
          asks whether the database is reachable therefore waits for the setup
          while the setup waits for the server, and the run dies on the timeout
          with no useful message. This static file only asks whether the server
          is listening.
        */
        url: `${baseUrl}/manifest.webmanifest`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: {
          PORT: port,
          NEXT_DIST_DIR: distDir,
          // The end-to-end tests change data, so they run against a database of
          // their own. This wins over the .env file.
          DATABASE_URL: e2eDatabaseUrl,
          /*
            Two-factor encrypts its secret with this. The suite runs against a
            scratch database that is wiped every run, so a fixed, obviously
            fake key is enough — and it means CI and a fresh clone work without
            a `.env` file. Never use this value anywhere else.
          */
          ENCRYPTION_KEY: 'deadbeef'.repeat(8),
        },
      },
});
