import { readFileSync } from 'node:fs';

import { expect, test, type Download } from '@playwright/test';

import { expectAppToBoot } from './helpers.ts';

/**
 * The account screen.
 *
 * This is where the address you sign in with and the password are changed, and
 * where the machines that are signed in are shown. It only reads here: a test
 * that changed the password would change it for every test after it.
 */
test.describe('account', () => {
  test('the header leads to the account', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);

    await page.getByRole('link', { name: 'Account', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole('heading', { name: 'Account', level: 2, exact: true }),
    ).toBeVisible();
  });

  test('it shows the address, the password, and this machine', async ({ page }) => {
    await page.goto('/account');
    await expectAppToBoot(page);

    const main = page.getByRole('main');

    // The address the app signs in with, editable.
    const email = main.getByLabel('Email');
    await expect(email).toBeVisible();
    await expect(email).toHaveValue(/@/);
    await expect(email).not.toHaveAttribute('readonly');

    // The password can be changed, and it asks for the current one.
    await expect(main.getByLabel('Current password', { exact: true })).toBeVisible();
    await expect(main.getByLabel('New password', { exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Change the password' })).toBeVisible();

    // This machine is the one we are looking at.
    await expect(main.getByText('This one')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  });

  test('the sign-in screen asks for an email and a password', async ({ page }) => {
    // No cookie: this is what a stranger finds.
    await page.context().clearCookies();
    await page.goto('/login');
    await expectAppToBoot(page);

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('the transactions download as a spreadsheet', async ({ page }) => {
    await page.goto('/account');
    await expectAppToBoot(page);

    const main = page.getByRole('main');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      main.getByRole('button', { name: 'Download' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^moneytracker-transactions-\d{4}-\d{2}-\d{2}\.csv$/);

    const csv = await downloadText(download);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'date,description,merchant,category,account,amount,currency,pending,transfer,category_source,category_reason',
    );
    // The seeded database has history, so there is more than the header.
    expect(lines.length).toBeGreaterThan(1);
    expect(csv).toMatch(/\r\n\d{4}-\d{2}-\d{2},/);
  });

  test('the export can be narrowed to a range with nothing in it', async ({ page }) => {
    await page.goto('/account');
    await expectAppToBoot(page);

    const main = page.getByRole('main');
    // A range that has not happened yet: the header, and no rows.
    await main.getByLabel('From').fill('2099-01-01');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      main.getByRole('button', { name: 'Download' }).click(),
    ]);

    const csv = await downloadText(download);
    expect(csv.trimEnd().split('\r\n')).toHaveLength(1);
  });

  test('the whole data downloads as JSON, minor units and all', async ({ page }) => {
    await page.goto('/account');
    await expectAppToBoot(page);

    const main = page.getByRole('main');
    await main.getByLabel('Format').selectOption('json');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      main.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const body = JSON.parse(await downloadText(download)) as {
      app: string;
      exportedAt: string;
      accounts: { id: string; name: string }[];
      categories: { name: string }[];
      transactions: { amountMinor: number; date: string; splits: unknown[] }[];
    };

    expect(body.app).toBe('moneytracker');
    expect(new Date(body.exportedAt).toString()).not.toBe('Invalid Date');
    expect(body.accounts.length).toBeGreaterThan(0);
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.transactions.length).toBeGreaterThan(0);
    // JSON is for machines: whole minor units, not a float.
    expect(Number.isInteger(body.transactions[0]?.amountMinor)).toBe(true);
  });
});

/** The text of a file the browser downloaded. */
async function downloadText(download: Download): Promise<string> {
  const path = await download.path();
  if (!path) throw new Error('The download has no path to read.');
  return readFileSync(path, 'utf8');
}
