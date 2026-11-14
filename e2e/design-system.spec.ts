import { expect, test } from '@playwright/test';

import { expectAppToBoot } from './helpers.ts';

test.describe('finance design system', () => {
  test('the shell follows the OS theme and keeps navigation in reach', async ({ page }) => {
    const desktop = (page.viewportSize()?.width ?? 0) >= 768;

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto('/overview');
      await expectAppToBoot(page);

      const shell = page.locator('[data-finance-shell]');
      await expect(shell).toBeVisible();
      await expect(page.locator('.finance-card').first()).toBeVisible();
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      ).toBe(colorScheme);

      await page.evaluate(() => document.fonts.ready);
      expect(
        await page
          .locator('.finance-wordmark')
          .evaluate((element) => getComputedStyle(element).fontFamily),
      ).toContain('Space Grotesk');
      const { overflow, navigation } = await page.evaluate(() => {
        const bounds = document.querySelector('nav')?.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          navigation: bounds ? { top: bounds.top, bottom: bounds.bottom } : null,
        };
      });
      expect(overflow).toBeLessThanOrEqual(1);
      expect(navigation).not.toBeNull();
      if (desktop) {
        expect(navigation!.top).toBeLessThan(180);
      } else {
        expect(navigation!.bottom).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) + 1);
      }
    }
  });
});
