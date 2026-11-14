import { expect, test } from '@playwright/test';

import { expectAppToBoot } from './helpers.ts';

const routes = [
  ['Transactions', '/transactions'],
  ['Review', '/review'],
  ['Rules', '/rules'],
  ['Import a file', '/import'],
  ['Connections', '/connections'],
  ['Budgets', '/budgets'],
  ['Goals', '/goals'],
  ['Subscriptions', '/subscriptions'],
  ['Alerts', '/alerts'],
] as const;

test.describe('workflow design', () => {
  test('every workflow shares the page hierarchy and fits the viewport', async ({ page }) => {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });

      for (const [title, route] of routes) {
        await page.goto(route);
        await expectAppToBoot(page);
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} in ${colorScheme} mode`).toBeLessThanOrEqual(1);
      }
    }

    await page.goto('/rules');
    await page.getByRole('button', { name: 'Add a rule' }).click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveClass(/finance-input/);
    await expect(page.getByRole('button', { name: 'Save rule' })).toHaveClass(
      /finance-button--primary/,
    );
  });
});
