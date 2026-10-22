import { expect, test } from '@playwright/test';

import { removeSplits } from './helpers.ts';

/**
 * The split flows.
 *
 * One charge can be more than one thing. The parts add up to the whole, and
 * every part counts under its own category.
 */
test.describe('splits', () => {
  test.afterAll(async () => {
    // The projects share one database, so the test has to leave it the way it
    // found it.
    await removeSplits();
  });

  test('a transaction can be split across categories', async ({ page }) => {
    await page.goto('/transactions?search=STARBUCKS');

    // A row that is not split yet. The projects share one database, so a row
    // may already carry a split from an earlier test.
    const row = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: 'Split', exact: true }) })
      .first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(page.getByText('Split this transaction')).toBeVisible();

    // Two halves add up to the whole.
    await page.getByRole('button', { name: 'Two halves' }).click();
    await expect(page.getByText('The parts add up to the whole.')).toBeVisible();

    // Each part gets its own category.
    await page.getByLabel('Category of part 1').selectOption({ label: 'Groceries' });
    await page.getByLabel('Category of part 2').selectOption({ label: 'Coffee' });

    await page.getByRole('button', { name: 'Save the split' }).click();
    await expect(page.getByText('Split saved')).toBeVisible();

    // The row says what it is now.
    await expect(page.getByRole('listitem').filter({ hasText: 'Split:' }).first()).toBeVisible();
    await expect(page.getByText('Split into 2 parts').first()).toBeVisible();

    // And it survives a reload, because the split is in the database.
    await page.reload();
    await expect(page.getByRole('listitem').filter({ hasText: 'Split:' }).first()).toBeVisible();
  });

  test('a split that does not add up is not saved', async ({ page }) => {
    await page.goto('/transactions?search=STARBUCKS');

    const row = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: 'Split', exact: true }) })
      .first();
    await row.getByRole('button', { name: 'Split', exact: true }).click();

    await page.getByLabel('Amount of part 1').fill('1.00');
    await page.getByLabel('Amount of part 2').fill('2.00');

    await expect(page.getByText(/left to split/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save the split' })).toBeDisabled();
  });
});
