import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const resolvePackage = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@moneytracker/core': resolvePackage('./packages/core/src/index.ts'),
      '@moneytracker/adapters': resolvePackage('./packages/adapters/src/index.ts'),
      '@moneytracker/db': resolvePackage('./packages/db/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
