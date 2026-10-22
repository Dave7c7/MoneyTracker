import { expect, test } from '@playwright/test';

import { expectAppToBoot, expectChartToDraw } from './helpers.ts';

/**
 * The end-to-end flows for Phase 1.
 *
 * They run against the seeded demo dataset, so the numbers are the ones the
 * hand-checked fixtures in `packages/core/test` produce.
 */
test.describe('dashboards', () => {
  test('the app takes over the page', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);
  });

  test('the charts draw their bars', async ({ page }) => {
    // Every page with a chart has to draw it. A chart that is empty looks
    // exactly like a page that is working.
    for (const path of ['/', '/spending', '/cash-flow']) {
      await page.goto(path);
      await expectAppToBoot(page);
      await expectChartToDraw(page);
    }
  });

  test('the overview shows the seeded month at a glance', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');

    await expect(page.getByRole('heading', { name: 'MoneyTracker', level: 1 })).toBeVisible();

    // October 2026 in the demo dataset: rent, groceries and the rest.
    await expect(main.getByText('$5,275.80').first()).toBeVisible();
    await expect(main.getByText('$5,202.91').first()).toBeVisible();
    await expect(main.getByText('$2,250.00').first()).toBeVisible();

    // The accounts carry their balances.
    await expect(main.getByText('Everyday Checking ••4417')).toBeVisible();
    await expect(main.getByText('High-Yield Savings ••8820')).toBeVisible();
    await expect(main.getByText('$25,450.98')).toBeVisible();
  });

  test('the spending chart covers a year of history', async ({ page }) => {
    await page.goto('/spending');
    const main = page.getByRole('main');

    await expect(page.getByRole('heading', { name: 'Spending', level: 2 })).toBeVisible();
    await expect(main.getByText(/Nov 2025 to Oct 2026/)).toBeVisible();
    await expect(main.getByText('Categories in Oct 2026')).toBeVisible();
    // The current month only, not the whole series.
    await expect(main.getByText('$2,250.00')).toBeVisible();
  });

  test('the cash flow page separates income from expenses', async ({ page }) => {
    await page.goto('/cash-flow');
    const main = page.getByRole('main');

    await expect(page.getByRole('heading', { name: 'Cash flow', level: 2 })).toBeVisible();
    await expect(main.getByText('$5,202.91').first()).toBeVisible();
    await expect(main.getByText('$5,275.80').first()).toBeVisible();
    await expect(main.getByText('Month by month')).toBeVisible();
    await expect(main.getByText('Transfers are excluded from income and expenses.')).toBeVisible();
  });

  test('the accounts page shows balances and net worth', async ({ page }) => {
    await page.goto('/accounts');
    const main = page.getByRole('main');

    await expect(page.getByRole('heading', { name: 'Accounts', level: 2 })).toBeVisible();
    await expect(main.getByText('Net worth')).toBeVisible();
    await expect(main.getByText('Rewards Credit Card ••5510')).toBeVisible();
    await expect(main.getByText('$24,746.68')).toBeVisible();
  });
});

test.describe('transactions', () => {
  test('the filters use the extra width on a large phone', async ({ page }) => {
    await page.goto('/transactions');

    const account = page.getByLabel('Account', { exact: true });
    const category = page.getByLabel('Category', { exact: true });

    const width = page.viewportSize()?.width ?? 0;
    const sameRow =
      Math.abs((await account.boundingBox())!.y - (await category.boundingBox())!.y) < 4;

    if (width >= 420) {
      // A Pixel 10 Pro XL is 448 CSS pixels wide: the two selects fit side by
      // side, so the filters take three rows instead of four.
      expect(sameRow).toBe(true);
    } else {
      // At 360 pixels the selects stack.
      expect(sameRow).toBe(false);
    }
  });

  test('searching narrows the list', async ({ page }) => {
    await page.goto('/transactions');
    const main = page.getByRole('main');

    await expect(page.getByRole('heading', { name: 'Transactions', level: 2 })).toBeVisible();
    await expect(main.getByText('100 shown')).toBeVisible();

    // The annual premium is the only charge with this merchant.
    await page.getByPlaceholder('Search merchant or description').fill('Annual Insurance');

    await expect(main.getByText('2 shown')).toBeVisible({ timeout: 15_000 });
    await expect(main.getByText('Annual Insurance Premium').first()).toBeVisible();
  });

  test('every transaction explains its category', async ({ page }) => {
    await page.goto('/transactions');
    const main = page.getByRole('main');

    await expect(main.getByRole('listitem').first()).toBeVisible();
    // The reason line is what makes categorization explainable.
    await expect(
      main.getByText(/Bank category|You categorized|Matched your rule/).first(),
    ).toBeVisible();
  });

  test('filtering by account works', async ({ page }) => {
    await page.goto('/transactions');
    const main = page.getByRole('main');

    await page.getByLabel('Account', { exact: true }).selectOption({ label: 'High-Yield Savings' });

    const items = main.getByRole('listitem');
    await expect(items.first()).toContainText('High-Yield Savings', { timeout: 15_000 });
    await expect(main.getByText(/shown$/)).not.toHaveText('100 shown');
  });
});
