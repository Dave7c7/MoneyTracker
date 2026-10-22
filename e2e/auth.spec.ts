import { expect, test } from '@playwright/test';

import { E2E_PASSWORD } from './auth.ts';
import { expectAppToBoot } from './helpers.ts';

/**
 * Signing in.
 *
 * These are the only tests that start without a cookie: the rest of the suite
 * runs signed in, because the app starts closed.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('signing in', () => {
  test('the app asks for a password before showing any money', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    // No navigation to the money, and no numbers on the page.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    await expect(page.getByText('NET WORTH')).toHaveCount(0);
  });

  test('the API answers 401 instead of data', async ({ request }) => {
    const response = await request.get('/api/transactions?limit=1');
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'Sign in first.' });
  });

  test('a wrong password is refused, and the right one gets in', async ({ page }) => {
    await page.goto('/login');
    await expectAppToBoot(page);

    await page.getByLabel('Password').fill('this is not the password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('do not match');
    await expect(page).toHaveURL(/\/login/);

    // Signing in with the right one clears the failed attempts as well.
    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expectAppToBoot(page);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  });
});
