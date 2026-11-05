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
    await page.goto('/overview');
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

    await expect(page).toHaveURL(/\/overview$/);
    await expectAppToBoot(page);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  });

  test('an address that keeps trying is turned away', async ({ request }, testInfo) => {
    /*
      Every project runs this test, and the counters live in the server, so each
      one knocks from its own address. The header is what the app reads as the
      client address; Next.js passes a client's value through, which is exactly
      why the lockout on the account is the guard that matters.
    */
    const addresses: Record<string, string> = {
      phone: '203.0.113.41',
      pixel: '203.0.113.42',
      desktop: '203.0.113.43',
    };
    const headers = { 'x-forwarded-for': addresses[testInfo.project.name] ?? '203.0.113.44' };
    const data = { password: 'not the password' };

    // The app is already claimed, so the route answers 409; six tries is more
    // than the five it allows from one address.
    let last = await request.post('/api/auth/setup', { headers, data });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      last = await request.post('/api/auth/setup', { headers, data });
    }

    expect(last.status()).toBe(429);
    expect(await last.json()).toMatchObject({ error: expect.stringContaining('Too many tries') });
    expect(last.headers()['retry-after']).toMatch(/^\d+$/);
  });
});
