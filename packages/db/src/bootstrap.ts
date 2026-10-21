/**
 * Database bootstrap.
 *
 * Creates the local user, the default category tree and the bank-category
 * mapping table. Safe to run repeatedly: nothing is duplicated.
 */

import { eq } from 'drizzle-orm';

import type { Database } from './client.ts';
import { DEFAULT_BANK_CATEGORY_MAPPING, DEFAULT_CATEGORIES } from './defaults.ts';
import { bankCategoryMappings, categories, users } from './schema.ts';

/** Details of the local user. */
export interface LocalUser {
  email: string;
  displayName: string;
  timeZone: string;
}

/**
 * Creates or updates the single local user.
 *
 * @example
 * const user = await ensureLocalUser(db, { email: 'you@example.com', displayName: 'Me', timeZone: 'UTC' });
 */
export async function ensureLocalUser(db: Database, details: LocalUser) {
  const [user] = await db
    .insert(users)
    .values({
      email: details.email,
      displayName: details.displayName,
      timeZone: details.timeZone,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { displayName: details.displayName, timeZone: details.timeZone },
    })
    .returning({ id: users.id });

  if (!user) throw new Error('Could not create the local user');
  return user;
}

/**
 * Creates the default category tree and returns the category ids by slug.
 *
 * @example
 * const categoryIds = await ensureDefaultCategories(db, userId);
 * categoryIds.get('groceries'); // uuid
 */
export async function ensureDefaultCategories(db: Database, userId: string) {
  const categoryIdBySlug = new Map<string, string>();

  for (const category of DEFAULT_CATEGORIES) {
    const [row] = await db
      .insert(categories)
      .values({
        userId,
        name: category.name,
        slug: category.slug,
        kind: category.kind,
        color: category.color,
        isSystem: true,
        sortOrder: category.sortOrder,
      })
      .onConflictDoNothing({ target: [categories.userId, categories.slug] })
      .returning({ id: categories.id });

    if (row) {
      categoryIdBySlug.set(category.slug, row.id);
      continue;
    }

    const existing = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, category.slug));
    if (existing[0]) categoryIdBySlug.set(category.slug, existing[0].id);
  }

  // Link the parents once both sides exist.
  for (const category of DEFAULT_CATEGORIES) {
    if (!category.parentSlug) continue;
    const parentId = categoryIdBySlug.get(category.parentSlug);
    const categoryId = categoryIdBySlug.get(category.slug);
    if (!parentId || !categoryId) continue;

    await db.update(categories).set({ parentId }).where(eq(categories.id, categoryId));
  }

  return categoryIdBySlug;
}

/**
 * Points the bank-category mapping table at the default categories.
 *
 * @example
 * await ensureBankCategoryMappings(db, userId, categoryIds);
 */
export async function ensureBankCategoryMappings(
  db: Database,
  userId: string,
  categoryIdBySlug: ReadonlyMap<string, string>,
) {
  for (const [sourceCategory, slug] of Object.entries(DEFAULT_BANK_CATEGORY_MAPPING)) {
    const categoryId = categoryIdBySlug.get(slug);
    if (!categoryId) continue;

    await db
      .insert(bankCategoryMappings)
      .values({ userId, sourceCategory, categoryId })
      .onConflictDoUpdate({
        target: [bankCategoryMappings.userId, bankCategoryMappings.sourceCategory],
        set: { categoryId },
      });
  }
}
