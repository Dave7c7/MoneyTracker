import { expect, test } from '@playwright/test';

/** Seeing transactions per day and per week. */
test.describe('transactions by day and week', () => {
  test('groups the list by day, with a heading and totals per day', async ({ page }) => {
    await page.goto('/transactions');
    await page
      .getByRole('navigation', { name: 'Group transactions' })
      .getByRole('link', { name: 'By day' })
      .click();

    await expect(page).toHaveURL(/view=day/);
    const firstDay = page.getByRole('region').first();
    await expect(firstDay.getByRole('heading')).toHaveText(
      /^(Pending|(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), \w{3} \d{1,2})$/,
    );
    await expect(firstDay.getByText(/\d+ transactions?/)).toBeVisible();
    await expect(firstDay.getByRole('listitem').first()).toBeVisible();
  });

  test('groups the list by week, from Sunday to Saturday', async ({ page }) => {
    await page.goto('/transactions?view=week');

    const headings = page.getByRole('region').getByRole('heading');
    await expect(headings.first()).toBeVisible();
    const labels = await headings.allTextContents();
    const weeks = labels.filter((label) => label !== 'Pending');
    expect(weeks.length).toBeGreaterThan(1);
    for (const label of weeks) expect(label).toMatch(/^\w{3} \d{1,2} – \w{3} \d{1,2}$/);
  });

  test('keeps the grouping when filtering, and goes back to the plain list', async ({ page }) => {
    await page.goto('/transactions?view=week&search=Blue%20Bottle');
    await expect(page.getByRole('region').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'By week' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('link', { name: 'List' }).click();
    await expect(page).toHaveURL(/search=Blue/);
    await expect(page).not.toHaveURL(/view=/);
    await expect(page.getByRole('region')).toHaveCount(0);
  });
});
