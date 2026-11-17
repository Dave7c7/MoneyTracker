import { expect, test, type Page } from '@playwright/test';

/**
 * Custom categories and keyword suggestions.
 *
 * The projects share one database, so every category name carries the
 * project name, and each test removes what it made.
 */

async function deleteCategoryNamed(page: Page, name: string) {
  const response = await page.request.get('/api/categories');
  const body = (await response.json()) as { categories: Array<{ id: string; name: string }> };
  const category = body.categories.find((item) => item.name === name);
  if (category) await page.request.delete(`/api/categories/${category.id}`);
}

test.describe('categories', () => {
  test('a new category can be picked for a transaction straight away', async ({
    page,
  }, testInfo) => {
    const name = `Rideshare ${testInfo.project.name}`;
    await deleteCategoryNamed(page, name);

    await page.goto('/categories');
    await page.getByPlaceholder('Rideshare, Pets, Gifts…').fill(name);
    await page.getByLabel('Inside group').selectOption({ label: 'Transport' });
    await page.getByRole('button', { name: 'Add category' }).click();

    await expect(page.getByText(`Added ${name}`)).toBeVisible();
    await expect(page.getByRole('paragraph').filter({ hasText: name })).toBeVisible();

    // It shows up in every category menu.
    await page.goto('/transactions');
    await page
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: /Category for/ })
      .click();
    await page.getByRole('listbox').getByPlaceholder('Find a category').fill(name);
    await expect(page.getByRole('listbox').getByRole('option', { name })).toBeVisible();

    await deleteCategoryNamed(page, name);
  });

  test('a category the user made can be renamed and deleted', async ({ page }, testInfo) => {
    const name = `Pets ${testInfo.project.name}`;
    const renamed = `Pet care ${testInfo.project.name}`;
    await deleteCategoryNamed(page, name);
    await deleteCategoryNamed(page, renamed);

    const created = await page.request.post('/api/categories', { data: { name } });
    expect(created.status()).toBe(201);

    await page.goto('/categories');
    const row = page.getByRole('listitem').filter({ hasText: name }).last();
    await row.getByRole('button', { name: 'Rename' }).click();
    await page.getByLabel(`New name for ${name}`).fill(renamed);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('paragraph').filter({ hasText: renamed })).toBeVisible();

    const renamedRow = page.getByRole('listitem').filter({ hasText: renamed }).last();
    await renamedRow.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: `Delete ${renamed}` }).click();
    await expect(page.getByText(`Deleted ${renamed}`)).toBeVisible();
    await expect(page.getByRole('paragraph').filter({ hasText: renamed })).toHaveCount(0);
  });

  test('default categories cannot be deleted', async ({ page }) => {
    await page.goto('/categories');
    const groceries = page.getByRole('listitem').filter({ hasText: 'Groceries' }).last();
    await expect(groceries.getByRole('button', { name: 'Rename' })).toBeVisible();
    await expect(groceries.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  });

  test('the category menu links to the categories page', async ({ page }) => {
    await page.goto('/transactions');
    await page
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: /Category for/ })
      .click();
    await page.getByRole('listbox').getByPlaceholder('Find a category').fill('Hobbies');
    await page.getByRole('link', { name: 'Create “Hobbies”…' }).click();

    await expect(page).toHaveURL(/\/categories\?name=Hobbies/);
    await expect(page.getByPlaceholder('Rideshare, Pets, Gifts…')).toHaveValue('Hobbies');
  });

  test('the review inbox can look for suggestions', async ({ page }) => {
    await page.goto('/review');
    const suggest = page.getByRole('button', { name: 'Suggest categories' });
    await expect(suggest).toBeVisible();
    await suggest.click();
    await expect(page.getByText(/Found suggestions for|No new suggestions found/)).toBeVisible();
  });
});
