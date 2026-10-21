/**
 * Applies database migrations.
 *
 * Run with `pnpm db:migrate`.
 */

import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabase } from './client.ts';
import { loadDotEnv, loadEnv } from './env.ts';

loadDotEnv();
const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

try {
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
