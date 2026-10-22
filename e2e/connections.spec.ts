import { expect, test } from '@playwright/test';

import { expectAppToBoot } from './helpers.ts';

/**
 * The connections screen.
 *
 * Whether the app can store a credential depends on the environment: with a
 * key it asks for a setup token, without one it says what is missing.
 */
test.describe('connections', () => {
  test('the screen says that no bank is connected', async ({ page }) => {
    await page.goto('/connections');
    await expectAppToBoot(page);

    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { name: 'Connections', level: 2 })).toBeVisible();
    await expect(main.getByText('No bank is connected yet.')).toBeVisible();
  });

  test('the screen asks for a setup token', async ({ page }) => {
    await page.goto('/connections');
    await expectAppToBoot(page);

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Connect a bank' })).toBeVisible();

    // The token can be pasted, unless the app has no encryption key yet.
    const token = main.getByLabel('Setup token');
    const missingKey = main.getByText(/no encryption key yet/);
    await expect(token.or(missingKey).first()).toBeVisible();
  });
});
