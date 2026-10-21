import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const resolvePackage = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const alias = {
  '@moneytracker/core': resolvePackage('./packages/core/src/index.ts'),
  '@moneytracker/adapters': resolvePackage('./packages/adapters/src/index.ts'),
  '@moneytracker/db': resolvePackage('./packages/db/src/index.ts'),
};

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
        },
      },
    ],
  },
});
