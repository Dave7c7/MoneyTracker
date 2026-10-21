/**
 * Seeds the database with the default categories and the mock dataset.
 *
 * Running it twice is safe: nothing is duplicated.
 */

import { getAdapter } from '@moneytracker/adapters';

import {
  ensureBankCategoryMappings,
  ensureDefaultCategories,
  ensureLocalUser,
} from './bootstrap.ts';
import { createDatabase } from './client.ts';
import { loadDotEnv, loadEnv } from './env.ts';
import { syncFromAdapter } from './sync.ts';

loadDotEnv();
const env = loadEnv();
const { db, pool } = createDatabase(env.DATABASE_URL);

try {
  const user = await ensureLocalUser(db, {
    email: env.DEFAULT_USER_EMAIL,
    displayName: env.DEFAULT_USER_NAME,
    timeZone: env.APP_TIMEZONE,
  });

  const categoryIds = await ensureDefaultCategories(db, user.id);
  await ensureBankCategoryMappings(db, user.id, categoryIds);

  const adapter = getAdapter(env.ADAPTER_ID);
  const result = await syncFromAdapter({ db, adapter, userId: user.id });

  console.log(`Seeded with the "${adapter.id}" adapter:`);
  console.log(`  accounts:            ${result.accountsUpserted}`);
  console.log(
    `  transactions:        ${result.transactionsInserted} new, ${result.transactionsUpdated} updated`,
  );
  console.log(`  assignments:         ${result.assignmentsWritten}`);
  console.log(`  balance snapshots:   ${result.balancesWritten}`);
} finally {
  await pool.end();
}
