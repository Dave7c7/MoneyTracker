import { expect, test } from '@playwright/test';

import { expectAppToBoot } from './helpers.ts';
import { createAlert, createDatabase, getLocalUser } from '../packages/db/src/index.ts';
import { alerts } from '../packages/db/src/schema.ts';

/**
 * The inbox.
 *
 * The rules are tested where they live — in `core` as sentences and in the
 * database as facts. This checks the wiring: the bell, the count, the list and
 * the two ways of marking something read. The alerts are put there directly,
 * because the checker has its own tests and a page test should not also be a
 * cron test.
 */
test.describe('alerts', () => {
  test.afterEach(async () => {
    const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) return;

    const { db, pool } = createDatabase(url);
    try {
      // The inbox is the only thing alerts add to the database, and this spec
      // is the only one that makes them, so emptying the table is the reset.
      await db.delete(alerts);
    } finally {
      await pool.end();
    }
  });

  test('the bell counts what is new, and reading clears it', async ({ page }) => {
    const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('The end-to-end tests need a database URL.');

    const { db, pool } = createDatabase(url);
    try {
      const user = await getLocalUser(db);
      if (!user) throw new Error('The end-to-end database has no user.');

      await createAlert(db, user.id, {
        kind: 'budget',
        title: 'Groceries is at 91% of its budget',
        body: 'Spent $455.00 of $500.00 this month.',
        href: '/budgets',
        dedupeKey: 'e2e:budget',
      });
      await createAlert(db, user.id, {
        kind: 'sync',
        title: 'SoFi stopped syncing',
        body: 'The connection said: The token expired.',
        href: '/connections',
        dedupeKey: 'e2e:sync',
      });
    } finally {
      await pool.end();
    }

    await page.goto('/');
    await expectAppToBoot(page);

    const bell = page.getByRole('link', { name: 'Alerts, 2 new' });
    await expect(bell).toBeVisible();
    await bell.click();

    await expect(page).toHaveURL(/\/alerts$/);
    await expect(page.getByText('Groceries is at 91% of its budget')).toBeVisible();
    await expect(page.getByText('SoFi stopped syncing')).toBeVisible();
    await expect(page.getByText('2 alerts are new.')).toBeVisible();

    // One at a time.
    await page.getByRole('button', { name: 'Mark read' }).first().click();
    await expect(page.getByText('1 alert is new.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Alerts, 1 new' })).toBeVisible();

    // And the rest.
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.getByText('All read')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Alerts', exact: true })).toBeVisible();

    // It stays read after a reload: the flag is in the database, not the page.
    await page.reload();
    await expectAppToBoot(page);
    await expect(page.getByText('All read')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
  });
});
