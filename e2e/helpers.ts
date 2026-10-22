/**
 * Helpers for the end-to-end tests.
 *
 * The projects share one database, so a test that changes data has to put it
 * back. These helpers do that from the database side, which is the only
 * place that can undo a change cleanly.
 *
 * The database package is imported from its source, because the tests run
 * outside the workspace packages and would otherwise not find it.
 */

import { expect, type Page } from '@playwright/test';

import {
  createDatabase,
  getLocalUser,
  removeBudgets,
  removeImportedRows,
  removeRecurringItems as removeRecurringItemsInApp,
  removeSavingsGoals,
  removeSplits as removeSplitsInApp,
} from '../packages/db/src/index.ts';

/** The database the end-to-end tests use. */
function databaseUrl(): string | undefined {
  return process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
}

/**
 * Removes everything an import brought in: the transactions, the account and
 * the profile.
 *
 * @example
 * await removeImportedData();
 */
export async function removeImportedData(): Promise<void> {
  const url = databaseUrl();
  if (!url) return;

  const { db, pool } = createDatabase(url);
  try {
    const user = await getLocalUser(db);
    if (user) await removeImportedRows(db, user.id);
  } finally {
    await pool.end();
  }
}

/**
 * Removes every split, so the database is the way it was found.
 *
 * @example
 * await removeSplits();
 */
export async function removeSplits(): Promise<void> {
  const url = databaseUrl();
  if (!url) return;

  const { db, pool } = createDatabase(url);
  try {
    const user = await getLocalUser(db);
    if (user) await removeSplitsInApp(db, user.id);
  } finally {
    await pool.end();
  }
}

/**
 * Removes the recurring charges, so the database is the way it was found.
 *
 * @example
 * await removeRecurringItems();
 */
export async function removeRecurringItems(): Promise<void> {
  const url = databaseUrl();
  if (!url) return;

  const { db, pool } = createDatabase(url);
  try {
    const user = await getLocalUser(db);
    if (user) await removeRecurringItemsInApp(db, user.id);
  } finally {
    await pool.end();
  }
}

/**
 * Removes the budgets and the goals, so the database is the way it was found.
 *
 * @example
 * await removePlans();
 */
export async function removePlans(): Promise<void> {
  const url = databaseUrl();
  if (!url) return;

  const { db, pool } = createDatabase(url);
  try {
    const user = await getLocalUser(db);
    if (user) {
      await removeBudgets(db, user.id);
      await removeSavingsGoals(db, user.id);
    }
  } finally {
    await pool.end();
  }
}

/**
 * Waits until the app has taken over the page.
 *
 * The pages are sent by the server and the interactive parts are added by
 * the browser. A page whose scripts never ran still shows its numbers, so
 * the tests have to check that the app really started.
 */
export async function expectAppToBoot(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-app', 'ready', { timeout: 30_000 });
  await expect(page.locator('[data-boot-warning]')).toBeHidden();
}

/**
 * Waits until a chart has drawn a bar that has a size.
 *
 * The charts are drawn in the browser, so a page can look complete while
 * every chart is empty. The bars grow from nothing while the chart animates,
 * so this waits for a bar with an area instead of looking once.
 */
export async function expectChartToDraw(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const bar = page.locator('.recharts-bar-rectangle').first();
        if ((await bar.count()) === 0) return 0;
        const box = await bar.boundingBox();
        return box ? box.width * box.height : 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
}
