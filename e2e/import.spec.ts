import { expect, test } from '@playwright/test';

import { removeImportedData } from './helpers.ts';

/**
 * The import flow.
 *
 * A file is read the way a saved profile says, the preview says what the
 * import will do, and the import puts the rows in.
 */
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

  test('a saved profile is offered again', async ({ page }, testInfo) => {
    await page.goto('/import');

    // The profile of the first test is still there.
    await expect(page.getByRole('button', { name: /E2E/ }).first()).toBeVisible();

    // Choosing it opens the mapping of that profile.
    await page.getByRole('button', { name: /E2E/ }).first().click();
    await expect(page.getByLabel('Profile name')).toHaveValue(`E2E ${testInfo.project.name}`);
  });
});
