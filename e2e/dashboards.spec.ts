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

  test('the donut shows where the month went', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);

    const card = page.locator('section', { hasText: 'Where the money went' }).first();
    await expect(card).toBeVisible();

    // The donut is drawn, and the legend says what every slice is.
    await expect(card.locator('.recharts-pie-sector').first()).toBeVisible();
    const rows = card.locator('ul li button');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(1);

    // The centre says the total of the month.
    const center = card.getByText(/^[A-Z][a-z]{2} \d{4} spending$/).locator('..');
    await expect(center.getByText(/^\$[\d,]+\.\d\d$/)).toBeVisible();

    // The chart says what it shows, for a screen reader.
    const label = await card.getByRole('img').getAttribute('aria-label');
    expect(label).toContain('spending');
    expect(label).toMatch(/\$[\d,]+\.\d\d/);
  });

  test('a group opens into its categories and comes back', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);

    const card = page.locator('section', { hasText: 'Where the money went' }).first();
    const first = card.locator('ul li button').first();
    const name = ((await first.getAttribute('aria-label')) ?? '').split(',')[0];

    await first.click();

    // The back button appears, and the centre shows the group that was
    // opened.
    const back = card.getByRole('button', { name: 'All categories' });
    await expect(back).toBeVisible();
    await expect(card.getByText(name ?? '', { exact: true })).toBeVisible();

    await back.click();
    await expect(back).toHaveCount(0);
  });

  test('another month resets the donut to the groups', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);

    const card = page.locator('section', { hasText: 'Where the money went' }).first();
    await card.locator('ul li button').first().click();
    await expect(card.getByRole('button', { name: 'All categories' })).toBeVisible();

    // Pick another month.
    const months = await card.locator('select option').allInnerTexts();
    const other = months[1];
    await card.locator('select').selectOption({ label: other ?? '' });

    // The drill-down is gone, and the month is the one that was picked.
    await expect(card.getByRole('button', { name: 'All categories' })).toHaveCount(0);
    await expect(card.getByText(`${other ?? ''} spending`)).toBeVisible();
  });

  test('a category takes the user to its transactions', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);

    const card = page.locator('section', { hasText: 'Where the money went' }).first();
    const first = card.locator('ul li button').first();
    await first.click();

    // A group with categories opens first; a group without them navigates
    // straight away.
    const back = card.getByRole('button', { name: 'All categories' });
    if (await back.isVisible()) {
      await card.locator('ul li button').first().click();
    }

    await page.waitForURL(/\/transactions\?/);
    const url = new URL(page.url());
    expect(url.searchParams.get('categoryId')).toBeTruthy();
    expect(url.searchParams.get('from')).toMatch(/^\d{4}-\d{2}-01$/);
    expect(url.searchParams.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('the donut fits a narrow phone', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);

    const width = page.viewportSize()?.width ?? 0;
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(width).toBeGreaterThan(0);
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
    await expect(main.getByText('Net worth', { exact: true })).toBeVisible();
    await expect(main.getByText('Rewards Credit Card ••5510')).toBeVisible();
    await expect(main.getByText('$24,746.68')).toBeVisible();
    // The net worth over time, drawn from the balance snapshots.
    await expect(main.getByRole('heading', { name: 'Net worth over time' })).toBeVisible();
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
