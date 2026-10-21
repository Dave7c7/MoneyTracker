import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * Lint configuration.
 *
 * The Next.js rules apply to the web app; the TypeScript rules apply
 * everywhere. Money and categorization code is held to the same standard as
 * the UI: no `any` without a comment, no unused code.
 */
const config = [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      'packages/db/drizzle/**',
      'apps/web/public/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      // The app uses the App Router, so there is no pages directory to check.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    // Tests may use loose typing for fixtures.
    files: ['**/test/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Command line tools print their results to stdout.
    files: [
      'packages/db/src/migrate.ts',
      'packages/db/src/seed.ts',
      'packages/db/src/reset.ts',
      '**/scripts/**/*.mjs',
    ],
    rules: {
      'no-console': 'off',
    },
  },
];

export default config;
