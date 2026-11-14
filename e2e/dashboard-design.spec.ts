import { expect, test } from '@playwright/test';

import { expectAppToBoot } from './helpers.ts';

test.describe('dashboard design', () => {
  test('the chart surfaces share the finance system and expose readable values', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const desktop = (page.viewportSize()?.width ?? 0) >= 768;

    await page.goto('/spending');
    await expectAppToBoot(page);
    await expect(page.getByRole('heading', { name: 'Spending', exact: true })).toBeVisible();
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();

    if (desktop) {
      await page.locator('.recharts-bar-rectangle').last().hover();
      const tooltip = page.locator('.finance-chart-tooltip');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('Oct 2026');
      await expect(tooltip).toContainText('Rent');
      await expect(tooltip).toContainText('$2,250.00');
    }

    await page.goto('/cash-flow');
    await expect(page.getByRole('heading', { name: 'Cash flow', exact: true })).toBeVisible();
    await expect(page.locator('.recharts-line').first()).toBeVisible();

    await page.goto('/accounts');
    await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
    await expect(page.locator('.recharts-area').first()).toBeVisible();

    for (const route of ['/spending', '/cash-flow', '/accounts']) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} has no horizontal overflow`).toBeLessThanOrEqual(1);
    }
  });
});
