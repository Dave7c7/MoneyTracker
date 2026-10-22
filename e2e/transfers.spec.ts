import { expect, test } from '@playwright/test';

/**
 * The transfer flows.
 *
 * A transfer is money moving between the user's own accounts. It stays in the
 * list, with a badge, and never counts as spending.
 */
test.describe('transfers', () => {
  test('a transfer is badged and stays out of the totals', async ({ page }) => {
    await page.goto('/transactions?search=ONLINE%20TRANSFER');

    const row = page.getByRole('listitem').first();
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Transfer', exact: true })).toBeVisible();

    // The category is Transfer, so the spending charts ignore it.
    await expect(row.getByRole('button', { name: /Category for/ })).toContainText('Transfer');
  });

  test('a transaction can be marked as a transfer by hand', async ({ page }) => {
    await page.goto('/transactions?search=STARBUCKS');

    // The projects share one database, so the test has to leave it the way it
    // found it. Every step below puts the row back.
    const markButton = page.getByRole('button', { name: 'Mark as transfer', exact: true }).first();
    await expect(markButton).toBeVisible();

    await markButton.click();

    // The app says what it did, the row carries the badge, and the category
    // follows.
    await expect(page.getByText('Marked as a transfer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transfer', exact: true }).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Category for/ }).filter({ hasText: 'Transfer' }).first(),
    ).toBeVisible();

    // And it can be taken back.
    await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
    await expect(page.getByText('No longer a transfer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark as transfer', exact: true }).first()).toBeVisible();
  });

  test('a confirmed transfer does not ask for review', async ({ page }) => {
    await page.goto('/review');

    // The two sides of a transfer are confident: they are not spending and
    // they do not need a decision.
    const inbox = page.getByRole('listitem');
    const count = await inbox.count();
    for (let index = 0; index < count; index += 1) {
      await expect(inbox.nth(index)).not.toContainText('TRANSFER TO SAVINGS');
    }
  });
});
