import { expect, test } from '@playwright/test';

import { expectAppToBoot } from './helpers.ts';

/**
 * The account screen.
 *
 * This is where the address you sign in with and the password are changed, and
 * where the machines that are signed in are shown. It only reads here: a test
 * that changed the password would change it for every test after it.
 */
test.describe('account', () => {
  test('the header leads to the account', async ({ page }) => {
    await page.goto('/');
    await expectAppToBoot(page);

    await page.getByRole('link', { name: 'Account', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole('heading', { name: 'Account', level: 2, exact: true }),
    ).toBeVisible();
  });

  test('it shows the address, the password, and this machine', async ({ page }) => {
    await page.goto('/account');
    await expectAppToBoot(page);

    const main = page.getByRole('main');

    // The address the app signs in with, editable.
    const email = main.getByLabel('Email');
    await expect(email).toBeVisible();
    await expect(email).toHaveValue(/@/);
    await expect(email).not.toHaveAttribute('readonly');

    // The password can be changed, and it asks for the current one.
    await expect(main.getByLabel('Current password', { exact: true })).toBeVisible();
    await expect(main.getByLabel('New password', { exact: true })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Change the password' })).toBeVisible();

    // This machine is the one we are looking at.
    await expect(main.getByText('This one')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  });

  test('the sign-in screen asks for an email and a password', async ({ page }) => {
    // No cookie: this is what a stranger finds.
    await page.context().clearCookies();
    await page.goto('/login');
    await expectAppToBoot(page);

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });
});
