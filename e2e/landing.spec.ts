import { expect, test, type Page } from '@playwright/test';

/**
 * The public landing page is the front door, not part of the signed-in money
 * app. These tests therefore start without the cookie used by the rest of the
 * suite.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(consoleErrors.get(page) ?? [], 'the browser console has no errors').toEqual([]);
});

test.describe('public landing page', () => {
  test('the main content renders without horizontal page overflow', async ({ page }) => {
    await openLanding(page);

    const main = page.getByRole('main');
    await expect(main).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#features .feature-card').first()).toBeVisible();
    await expect(page.locator('#gallery .gallery-card').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ready to take the controls?' })).toBeVisible();
    await expect(page.locator('.site-footer')).toBeVisible();

    // Web fonts can change line wrapping after the server-rendered page arrives.
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('desktop navigation exposes the sections and follows a link', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, 'desktop navigation only');
    await openLanding(page);

    const navigation = page.getByRole('navigation', { name: 'Main', exact: true });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('link')).toHaveText([
      'Why',
      'Features',
      'Inside the app',
      'How it works',
    ]);
    await expect(page.locator('.mobile-nav')).toBeHidden();
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Open the app', exact: true }),
    ).toBeVisible();

    await navigation.getByRole('link', { name: 'Features', exact: true }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.locator('#features')).toBeInViewport();
  });

  test('mobile navigation is keyboard accessible and closes after use', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'mobile navigation only');
    await openLanding(page);

    await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeHidden();
    const openButton = page.getByRole('button', { name: 'Open navigation', exact: true });
    const mobileNavigation = page.getByRole('navigation', { name: 'Mobile main menu' });

    await expect(openButton).toBeVisible();
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');
    await openButton.focus();
    await page.keyboard.press('Enter');

    const closeButton = page.getByRole('button', { name: 'Close navigation', exact: true });
    await expect(closeButton).toHaveAttribute('aria-expanded', 'true');
    await expect(mobileNavigation).toBeVisible();
    await expect(
      mobileNavigation.getByRole('link', { name: 'Open the app', exact: true }),
    ).toBeVisible();
    await expect(
      mobileNavigation.getByRole('link', { name: 'Contact', exact: true }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');
    await expect(mobileNavigation).toBeHidden();
    await expect(openButton).toBeFocused();

    await openButton.press('Enter');
    await mobileNavigation.getByRole('link', { name: 'Why', exact: true }).click();
    await expect(page).toHaveURL(/#about$/);
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');
    await expect(mobileNavigation).toBeHidden();
  });

  test('the contact form has labels and confirms its presentational submit', async ({ page }) => {
    await openLanding(page);

    const form = page.locator('#contact form');
    const name = form.getByLabel('Your name', { exact: true });
    const email = form.getByLabel('Email address', { exact: true });
    const setup = form.getByLabel(/Where would you run it\?/);
    const question = form.getByLabel('What would you like to understand?', { exact: true });
    const status = form.getByRole('status');

    await expect(name).toBeVisible();
    await expect(email).toBeVisible();
    await expect(setup).toBeVisible();
    await expect(question).toBeVisible();
    await expect(status).toHaveText('');

    await name.fill('Ada Lovelace');
    await email.fill('ada@example.com');
    await setup.fill('A small home server');
    await question.fill('How do I import my first bank export?');

    await expect(name).toHaveValue('Ada Lovelace');
    await expect(email).toHaveValue('ada@example.com');
    await expect(setup).toHaveValue('A small home server');
    await expect(question).toHaveValue('How do I import my first bank export?');

    const url = page.url();
    await form.getByRole('button', { name: 'Preview the note' }).click();
    await expect(status).toContainText('Thanks, Ada Lovelace.');
    await expect(status).toContainText('nothing was sent');
    expect(page.url()).toBe(url);
  });

  test('an unavailable WebGL context keeps the composed static artwork', async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = new Proxy(getContext, {
        apply(target, thisArg, argumentsList) {
          if (['webgl2', 'webgl', 'experimental-webgl'].includes(argumentsList[0])) return null;
          return Reflect.apply(target, thisArg, argumentsList);
        },
      });
    });
    await openLanding(page);

    const scene = page.locator('.hero-scene');
    await expect(scene).toHaveAttribute('data-webgl', 'fallback');
    await expect(scene.locator('[data-sculpture-fallback]')).toBeVisible();
    await expect(scene.locator('canvas')).toHaveCount(0);
  });

  test('reduced motion keeps a static sculpture and a stacked gallery', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLanding(page);

    const scene = page.locator('.hero-scene');
    const fallback = scene.locator('[data-sculpture-fallback]');
    await expect(scene).toHaveAttribute('data-webgl', 'fallback');
    await expect(fallback).toBeVisible();
    await expect(scene.locator('canvas')).toHaveCount(0);
    await expect(fallback.locator('.sculpture-fallback__form')).toHaveCSS('animation-name', 'none');

    const gallery = page.locator('#gallery');
    await expect(gallery).toHaveAttribute('data-enhanced', 'false');
    await expect(gallery.locator('.gallery__track')).toHaveCSS('transform', 'none');
    await expect(gallery.locator('.gallery__progress')).toBeHidden();
  });
});

/** Open the public page and wait until its client-only visual has settled. */
async function openLanding(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your money, in focus', level: 1 })).toBeVisible();
  await expect(page.locator('.hero-scene')).toHaveAttribute('data-webgl', /^(ready|fallback)$/, {
    timeout: 30_000,
  });
}
