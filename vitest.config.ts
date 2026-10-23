import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { DEFAULT_TEST_DATABASE_URL } from './packages/db/src/test-database.ts';

const resolvePackage = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const alias = {
  '@moneytracker/core': resolvePackage('./packages/core/src/index.ts'),
  '@moneytracker/adapters': resolvePackage('./packages/adapters/src/index.ts'),
  '@moneytracker/db': resolvePackage('./packages/db/src/index.ts'),
};

/*
  The test database has a default, so `pnpm test` works on a fresh checkout
  with nothing to configure. This is set here, in the main process, because the
  test files read it when they load: a value set later, in a global setup, is
  read by that process and not by the workers.
*/
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL;
process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: [
            'packages/core/test/**/*.test.ts',
            'packages/adapters/test/**/*.test.ts',
            'apps/*/test/**/*.test.ts',
          ],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: ['packages/db/test/**/*.test.ts'],
          // The database tests share one scratch database, so they must not
          // run at the same time.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
          // The same address the setup provisions, passed explicitly so a
          // worker can never disagree about which database it is emptying.
          env: { TEST_DATABASE_URL: testDatabaseUrl },
          // Creates and migrates the scratch database, and holds a lock for the
          // run so two runs cannot empty each other's tables.
          globalSetup: ['./vitest.global-setup.ts'],
        },
      },
    ],
  },
});
