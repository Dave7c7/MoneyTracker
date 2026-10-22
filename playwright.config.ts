import { defineConfig, devices } from '@playwright/test';

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
        // The health check is used as the readiness probe on purpose: it only
        // asks whether the database is reachable. The pages themselves need the
        // schema, and the schema is created by the global setup, which runs
        // after the server has started.
        url: `${baseUrl}/api/health`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: {
          PORT: port,
          NEXT_DIST_DIR: distDir,
          ...(process.env.E2E_DATABASE_URL
            ? {
                // The end-to-end tests change data, so they run against a
                // database of their own. The environment variable wins over the
                // .env file.
                DATABASE_URL: process.env.E2E_DATABASE_URL,
              }
            : {}),
        },
      },
});
