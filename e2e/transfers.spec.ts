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
    await page.goto('/transactions?search=Blue%20Bottle');

    const row = page.getByRole('listitem').first();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Mark as transfer', exact: true }).click();

    // The badge appears, and the category follows.
    await expect(row.getByRole('button', { name: 'Transfer', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: /Category for/ })).toContainText('Transfer');

    // And it can be taken back.
    await row.getByRole('button', { name: 'Transfer', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Mark as transfer', exact: true })).toBeVisible();
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
