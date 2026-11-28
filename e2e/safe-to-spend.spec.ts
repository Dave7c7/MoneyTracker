import { expect, test } from '@playwright/test';

/** The "safe to spend" number on the overview. */
test.describe('safe to spend', () => {
  test('shows what is left this month and how it is worked out', async ({ page }) => {
    await page.goto('/overview');

    const card = page.getByTestId('safe-to-spend');
    await expect(card).toBeVisible();
    await expect(card.getByText('Safe to spend this month')).toBeVisible();
    await expect(card.getByTestId('safe-to-spend-amount')).toHaveText(
      /^(-?\$[\d,]+\.\d{2}|Over by \$[\d,]+\.\d{2})$/,
    );

    await card.getByText('How this is worked out').click();
    await expect(card.getByText(/Income this month|Income \(/)).toBeVisible();
    await expect(card.getByText('Spent so far')).toBeVisible();
    await expect(card.getByText('Bills still due this month')).toBeVisible();

    // Nothing in the card runs off the side of a phone screen.
    const box = await card.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x + box.width <= viewport.width).toBeTruthy();
  });
});
