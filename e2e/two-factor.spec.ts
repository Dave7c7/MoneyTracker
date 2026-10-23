import { expect, test } from '@playwright/test';

import { E2E_PASSWORD } from './auth.ts';
import { expectAppToBoot } from './helpers.ts';
import {
  createDatabase,
  disableTwoFactor,
  getLocalUser,
} from '../packages/db/src/index.ts';
import { totpCode } from '../packages/db/src/totp.ts';

/**
 * Two-factor sign-in, end to end.
 *
 * The whole path in one test, because it changes the account for every test
 * that follows: on, a sign-in with a code, a sign-in with a recovery code, and
 * off again. The `afterEach` turns it off even when an expectation fails, so a
 * broken run does not leave the suite locked out.
 *
 * The code is computed from the secret the setup screen shows, with the same
 * function the server uses: the point of the test is the wiring, not the
 * arithmetic, which has its own vectors.
 *
 * Confirming the setup does not spend the code's step, so the sign-in below
 * can use the same code the person just saw.
 */
test.describe('two-factor sign-in', () => {
  test.afterEach(async () => {
    // The database is the only place that can put this back reliably: a test
    // that failed halfway has no page to click.
    const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) return;

    const { db, pool } = createDatabase(url);
    try {
      const user = await getLocalUser(db);
      if (user) await disableTwoFactor(db, user.id);
    } finally {
      await pool.end();
    }
  });

  test('turns on, asks for a code, accepts a recovery code, and turns off', async ({ page }) => {
    await page.goto('/account');
    await expectAppToBoot(page);

    const card = page.locator('section').filter({ hasText: 'Two-factor sign-in' });

    // Off, and asking for the password before it will start.
    await expect(card.getByRole('button', { name: 'Turn on two-factor' })).toBeVisible();
    await card.getByLabel('Current password, to turn it on').fill(E2E_PASSWORD);
    await card.getByRole('button', { name: 'Turn on two-factor' }).click();

    // The secret is shown once, to type into the authenticator.
    //
    // The "off" form has a hint naming ENCRYPTION_KEY in its own <code>, so
    // wait for the code whose text is a secret rather than the first one on
    // the card. A failed start leaves the hint and an alert behind, and the
    // alert's text says why.
    const secretText = card.locator('code').filter({ hasText: /^[A-Z2-7]{32}$/ });
    const setupError = card.getByRole('alert');
    await expect(secretText.or(setupError)).toBeVisible();
    if (await setupError.isVisible()) {
      const reason = (await setupError.textContent())?.trim();
      throw new Error(`Two-factor setup did not start: ${reason}`);
    }
    await expect(secretText).toHaveText(/^[A-Z2-7]{32}$/);
    const secret = (await secretText.textContent())?.trim() ?? '';

    await card.getByLabel('The code it shows').fill(totpCode(secret, Date.now()));
    await card.getByRole('button', { name: 'Confirm and turn on' }).click();

    await expect(card.getByText('Two-factor is on.')).toBeVisible();
    const codes = await card.locator('ul li').allTextContents();
    expect(codes).toHaveLength(8);

    await card.getByRole('button', { name: 'I have written them down' }).click();
    await expect(card.getByText(/^On since /)).toBeVisible();

    // Signing in now takes the password and then a code. Only this context
    // forgets its cookie: signing out for real would end the session every
    // other project starts from.
    await page.context().clearCookies();
    await page.goto('/login');
    await expectAppToBoot(page);

    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // The code field appears without asking for the password again.
    await expect(page.getByLabel('Code')).toBeVisible();
    await page.getByLabel('Code').fill(totpCode(secret, Date.now()));
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    // A lost phone: a recovery code works in the same field, once.
    await page.context().clearCookies();
    await page.goto('/login');
    await expectAppToBoot(page);

    await page.getByLabel('Password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByLabel('Code').fill(codes[0] ?? '');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/$/);

    // And off again, with the password.
    await page.goto('/account');
    await expectAppToBoot(page);
    await expect(card.getByText(/^7 recovery codes are left/)).toBeVisible();

    await card.getByLabel('Current password, to turn it off').fill(E2E_PASSWORD);
    await card.getByRole('button', { name: 'Turn off two-factor' }).click();
    await expect(card.getByRole('button', { name: 'Turn on two-factor' })).toBeVisible();
  });
});
