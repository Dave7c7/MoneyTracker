import { expect, test } from '@playwright/test';

import { removeImportedData } from './helpers.ts';

/**
 * The import flow.
 *
 * A file is read the way a saved profile says, the preview says what the
 * import will do, and the import puts the rows in.
 */
/**
 * A SoFi Money export, as the bank writes it: month-first dates, money out as a
 * negative number, and a Type column that says how the money moved.
 */
const SOFI_CHECKING = [
  'Date,Description,Type,Amount,Current Balance',
  '10/01/2026,BLUE BOTTLE COFFEE,Card Purchase,-4.50,1200.00',
  '10/02/2026,ACME PAYROLL,Deposit,2500.00,3700.00',
  '10/03/2026,BOOK STORE,Card Purchase,-45.00,3655.00',
].join('\n');

const CSV = [
  'Date,Amount,Description,Memo',
  '2026-01-05,-12.34,BLUE BOTTLE COFFEE,1234',
  '2026-01-06,2500.00,ACME PAYROLL,5678',
  '2026-01-07,-45.00,BOOK STORE,9012',
].join('\n');

test.describe('import', () => {
  test.afterAll(async () => {
    // The projects share one database, so the test has to leave it the way it
    // found it.
    await removeImportedData();
  });

  test('a file is imported with a saved profile', async ({ page }, testInfo) => {
    await page.goto('/import');

    await page.setInputFiles('input[type=file]', {
      name: 'export.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV),
    });

    // The app reads the column names and fills in the mapping.
    await expect(page.getByText('How should this file be read?')).toBeVisible();

    await page.getByLabel('Profile name').fill(`E2E ${testInfo.project.name}`);
    await page.getByLabel('Account name').fill(`E2E ${testInfo.project.name}`);
    await page.getByRole('button', { name: 'Save and preview' }).click();

    // The preview says what the file would do.
    await expect(page.getByText('What this file would do')).toBeVisible();
    await expect(page.getByText('3 rows', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Columns that are not used: Memo')).toBeVisible();

    await page.getByRole('button', { name: 'Import 3 rows' }).click();

    // And the import says what it did.
    await expect(page.getByText('The file is in')).toBeVisible();
    await expect(page.getByText('Rows added')).toBeVisible();

    // The rows are in the app.
    await page.goto('/transactions?search=BOOK%20STORE');
    await expect(page.getByRole('listitem').first()).toBeVisible();
    await expect(page.getByText('BOOK STORE').first()).toBeVisible();
  });

  test('a SoFi export is recognised, and imported as it is', async ({ page }, testInfo) => {
    await page.goto('/import');

    await page.setInputFiles('input[type=file]', {
      name: 'sofi-checking.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(SOFI_CHECKING),
    });

    // The app says what it thinks the file is, and fills in the name.
    await expect(page.getByText('Looks like a SoFi Checking or savings export')).toBeVisible();
    await expect(page.getByLabel('Profile name')).toHaveValue('SoFi Checking or savings');
    await expect(page.getByLabel('Institution')).toHaveValue('SoFi');

    // The profile name has to be its own, or the projects collide.
    await page.getByLabel('Profile name').fill(`SoFi E2E ${testInfo.project.name}`);
    await page.getByRole('button', { name: 'Save and preview' }).click();

    // The preview says what the file would do, and that Type is not a category.
    await expect(page.getByText('What this file would do')).toBeVisible();
    await expect(page.getByText('3 rows', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Columns that are not used: Type')).toBeVisible();

    await page.getByRole('button', { name: /^Import \d+ rows?$/ }).click();
    await expect(page.getByText('The file is in')).toBeVisible();

    // The month-first date was read, so the row is in the app.
    await page.goto('/transactions?search=BLUE%20BOTTLE');
    await expect(page.getByText('BLUE BOTTLE COFFEE').first()).toBeVisible();
  });

  test('a saved profile is offered again', async ({ page }, testInfo) => {
    const name = `Again ${testInfo.project.name}`;

    await page.goto('/import');
    await page.setInputFiles('input[type=file]', {
      name: 'again.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV),
    });
    await expect(page.getByText('How should this file be read?')).toBeVisible();

    await page.getByLabel('Profile name').fill(name);
    await page.getByLabel('Account name').fill(name);
    await page.getByRole('button', { name: 'Save and preview' }).click();
    await expect(page.getByText('What this file would do')).toBeVisible();

    // The next visit offers it, and choosing it loads its mapping.
    await page.goto('/import');
    await page
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
    await expect(page.getByLabel('Profile name')).toHaveValue(name);
  });
});
