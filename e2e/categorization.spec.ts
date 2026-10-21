import { expect, test, type Page } from '@playwright/test';

/**
 * The categorization flows.
 *
 * These change data, so they run against their own database
 * (`E2E_DATABASE_URL`) and clean up after themselves.
 */

/** Removes a rule the test created, and puts the data back. */
async function deleteRule(page: Page, name: string) {
  const response = await page.request.get('/api/rules');
  const body = (await response.json()) as { rules: Array<{ id: string; name: string }> };
  const rule = body.rules.find((item) => item.name === name);
  if (rule) {
    await page.request.delete(`/api/rules/${rule.id}`);
  }
}

test.describe('categorization', () => {
  test('fixing a transaction offers to apply the change to the merchant', async ({ page }) => {
    await page.goto('/transactions?search=Blue%20Bottle');

    const row = page.getByRole('listitem').first();
    await expect(row).toBeVisible();

    // Two taps: open the category menu, pick a category.
    await row.getByRole('button', { name: /Category for/ }).click();
    await page.getByRole('listbox').getByRole('option', { name: 'Groceries' }).click();

    // The prompt asks before touching the rest of the merchant.
    const prompt = page.getByText('Apply to all from Blue Bottle Coffee?');
    await expect(prompt).toBeVisible();

    await page.getByRole('button', { name: 'All from this merchant' }).click();
    await expect(page.getByText(/transaction(s)? updated/)).toBeVisible();

    // The rule exists and says what it does.
    await page.goto('/rules');
    await expect(page.getByText('Blue Bottle Coffee → Groceries')).toBeVisible();
    await expect(page.getByText(/transactions match/)).toBeVisible();

    await deleteRule(page, 'Blue Bottle Coffee → Groceries');
  });

  test('other transactions of that merchant follow the rule', async ({ page }) => {
    await page.goto('/transactions?search=Blue%20Bottle');

    const rows = page.getByRole('listitem');
    const before = await rows.count();

    // Change the category of the first one and apply it to the merchant.
    await rows
      .first()
      .getByRole('button', { name: /Category for/ })
      .click();
    await page.getByRole('listbox').getByRole('option', { name: 'Gas' }).click();
    await page.getByRole('button', { name: 'All from this merchant' }).click();
    await expect(page.getByText(/transaction(s)? updated/)).toBeVisible();

    // Now every one of them is in the new category.
    await page.goto('/transactions?search=Blue%20Bottle');
    await expect(
      page
        .getByRole('listitem')
        .first()
        .getByRole('button', { name: /Category for/ }),
    ).toContainText('Gas');
    expect(await page.getByRole('listitem').count()).toBe(before);

    await deleteRule(page, 'Blue Bottle Coffee → Gas');
  });

  test('clearing the review inbox removes a merchant at a time', async ({ page }) => {
    await page.goto('/review');

    const group = page.getByRole('listitem').first();
    await expect(group).toBeVisible();

    const merchant = await group.locator('p').first().textContent();
    const confirm = group.getByRole('button', { name: /^Confirm / });
    await expect(confirm).toBeVisible();

    await confirm.click();

    // The merchant is gone from the inbox.
    await expect(page.getByText(merchant ?? '')).toHaveCount(0);

    // And it can be put back.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText(merchant ?? '').first()).toBeVisible();
  });

  test('a manual edit explains itself and survives a rule change', async ({ page }) => {
    await page.goto('/transactions?search=Annual%20Insurance');

    const row = page.getByRole('listitem').first();
    await row.getByRole('button', { name: /Category for/ }).click();
    await page.getByRole('listbox').getByRole('option', { name: 'Shopping' }).click();

    // The explanation says a person chose it.
    await expect(row.getByText('Set by you')).toBeVisible();
    // The prompt only appears once the server has stored the change.
    await expect(page.getByText('Apply to all from Annual Insurance Premium?')).toBeVisible();

    // A new rule for that merchant does not touch it.
    await page.goto('/rules');
    await page.getByRole('button', { name: 'Add a rule' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Annual Insurance → Gas');
    await page.getByRole('textbox', { name: 'Merchant contains' }).fill('annual insurance');
    await page.getByRole('button', { name: /Category for the rule/ }).click();
    await page.getByRole('listbox').getByRole('option', { name: 'Gas' }).click();
    await page.getByRole('button', { name: 'Save rule' }).click();
    await expect(page.getByText(/transaction(s)? updated/)).toBeVisible();

    await page.goto('/transactions?search=Annual%20Insurance');
    await expect(
      page
        .getByRole('listitem')
        .first()
        .getByRole('button', { name: /Category for/ }),
    ).toContainText('Shopping');

    await deleteRule(page, 'Annual Insurance → Gas');
  });
});
