/**
 * Resets a scratch database: schema, migrations and demo data.
 *
 * This is destructive, so it refuses to run against anything that does not
 * look like a test database.
 */

import { loadDotEnv, loadEnv } from './env.ts';

loadDotEnv();
const env = loadEnv();

if (!/test|e2e/i.test(env.DATABASE_URL)) {
  throw new Error(
    `Refusing to reset a database that does not look like a test one: ${env.DATABASE_URL}\n` +
      'Point DATABASE_URL at a scratch database, or use E2E_DATABASE_URL.',
  );
}

const { migrate } = await import('drizzle-orm/node-postgres/migrator');
const { sql } = await import('drizzle-orm');
const { createDatabase } = await import('./client.ts');
const { ensureBankCategoryMappings, ensureDefaultCategories, ensureLocalUser } =
  await import('./bootstrap.ts');
const { syncFromAdapter } = await import('./sync.ts');
const { getAdapter } = await import('@moneytracker/adapters');
const { fileURLToPath } = await import('node:url');

const { db, pool } = createDatabase(env.DATABASE_URL);
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

try {
  await db.execute(
    sql`drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public;`,
  );
  await migrate(db, { migrationsFolder });

  const user = await ensureLocalUser(db, {
    email: env.DEFAULT_USER_EMAIL,
    displayName: env.DEFAULT_USER_NAME,
    timeZone: env.APP_TIMEZONE,
  });

  const categoryIds = await ensureDefaultCategories(db, user.id);
  await ensureBankCategoryMappings(db, user.id, categoryIds);

  const adapter = getAdapter(env.ADAPTER_ID);
  const result = await syncFromAdapter({ db, adapter, userId: user.id });

  console.log(`Reset ${env.DATABASE_URL}`);
  console.log(`  transactions: ${result.transactionsInserted}`);
} finally {
  await pool.end();
}
