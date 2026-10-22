import { expect, test } from '@playwright/test';

import { expectAppToBoot, removePlans, removeRecurringItems } from './helpers.ts';

/**
 * The plan screens: subscriptions, budgets and goals.
 *
 * They run against the seeded demo dataset, so the subscriptions the mock
 * data contains are the ones the app has to find.
 */
test.describe('the plan', () => {
  test.afterAll(async () => {
    await removeRecurringItems();
    await removePlans();
  });

  test('the subscriptions screen finds the recurring charges', async ({ page }) => {
    await page.goto('/subscriptions');
    await expectAppToBoot(page);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Subscriptions', level: 2 })).toBeVisible();

    // The demo data has monthly subscriptions and bills.
    await expect(main.getByText('Netflix').first()).toBeVisible();
    await expect(main.getByText('Spotify').first()).toBeVisible();
    // A merchant that only charges now and then is not a subscription.
    await expect(main.getByText('Target', { exact: true })).toHaveCount(0);

    // The app says what they cost.
    await expect(main.getByText('What the recurring charges cost')).toBeVisible();
  });

  test('a detected charge can be confirmed', async ({ page }) => {
    await page.goto('/subscriptions');
    await expectAppToBoot(page);

    const detected = page.locator('section[aria-labelledby="detected-heading"]');
    const card = detected.locator('li', { hasText: 'Netflix' }).first();
    await card.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Kept as a recurring charge.')).toBeVisible();
    // A confirmed charge is kept, not asked about again.
    await expect(detected.getByText('Netflix')).toHaveCount(0);
  });

  test('a budget can be set and shows what is left', async ({ page }) => {
    await page.goto('/budgets');
    await expectAppToBoot(page);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Budgets', level: 2 })).toBeVisible();

    await main.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Groceries' });
    await main.getByRole('textbox', { name: 'Limit for the month' }).fill('500');
    await main.getByRole('button', { name: 'Save the budget' }).click();

    await expect(main.getByText('Groceries').first()).toBeVisible();
    await expect(main.getByText(/\$[\d,]+\.\d\d (left|over)/)).toBeVisible();
  });

  test('a goal can be added and shows the progress', async ({ page }) => {
    await page.goto('/goals');
    await expectAppToBoot(page);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Goals', level: 2, exact: true })).toBeVisible();

    await main.getByRole('textbox', { name: 'Name' }).fill('Emergency fund');
    await main.getByRole('textbox', { name: 'Target' }).fill('5000');
    await main.getByRole('textbox', { name: 'Set aside so far' }).fill('1000');
    await main.getByRole('button', { name: 'Add the goal' }).click();

    await expect(main.getByText('Emergency fund').first()).toBeVisible();
    await expect(main.getByText('$1,000.00 of $5,000.00')).toBeVisible();
    await expect(main.getByRole('img', { name: /20 percent of the target reached/ })).toBeVisible();
  });
});
