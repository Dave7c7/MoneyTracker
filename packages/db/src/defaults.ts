/**
 * Default categories and the bank-category mapping table.
 *
 * These ship with the app so a new user has a sensible category tree on day
 * one. Users can rename them, add their own, and change the mapping.
 */

import type { CategoryKind } from '@moneytracker/core';

/** A category that ships with the app. */
export interface DefaultCategory {
  slug: string;
  name: string;
  kind: CategoryKind;
  color: string;
  parentSlug?: string;
  sortOrder: number;
}

/**
 * The default category tree.
 *
 * Parents group categories for the charts; the kind decides how a category
 * counts towards spending, income or transfers.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { slug: 'income', name: 'Income', kind: 'income', color: '#16a34a', sortOrder: 0 },
  {
    slug: 'salary',
    name: 'Salary',
    kind: 'income',
    color: '#16a34a',
    parentSlug: 'income',
    sortOrder: 1,
  },
  {
    slug: 'other-income',
    name: 'Other Income',
    kind: 'income',
    color: '#22c55e',
    parentSlug: 'income',
    sortOrder: 2,
  },

  { slug: 'housing', name: 'Housing', kind: 'spending', color: '#0ea5e9', sortOrder: 10 },
  {
    slug: 'rent',
    name: 'Rent',
    kind: 'spending',
    color: '#0ea5e9',
    parentSlug: 'housing',
    sortOrder: 11,
  },
  {
    slug: 'utilities',
    name: 'Utilities',
    kind: 'spending',
    color: '#38bdf8',
    parentSlug: 'housing',
    sortOrder: 12,
  },

  { slug: 'bills', name: 'Bills', kind: 'spending', color: '#6366f1', sortOrder: 20 },
  {
    slug: 'internet',
    name: 'Internet',
    kind: 'spending',
    color: '#818cf8',
    parentSlug: 'bills',
    sortOrder: 21,
  },
  {
    slug: 'phone',
    name: 'Phone',
    kind: 'spending',
    color: '#a5b4fc',
    parentSlug: 'bills',
    sortOrder: 22,
  },
  {
    slug: 'insurance',
    name: 'Insurance',
    kind: 'spending',
    color: '#c7d2fe',
    parentSlug: 'bills',
    sortOrder: 23,
  },

  { slug: 'food', name: 'Food', kind: 'spending', color: '#f97316', sortOrder: 30 },
  {
    slug: 'groceries',
    name: 'Groceries',
    kind: 'spending',
    color: '#f97316',
    parentSlug: 'food',
    sortOrder: 31,
  },
  {
    slug: 'restaurants',
    name: 'Restaurants',
    kind: 'spending',
    color: '#fb923c',
    parentSlug: 'food',
    sortOrder: 32,
  },
  {
    slug: 'coffee',
    name: 'Coffee',
    kind: 'spending',
    color: '#fdba74',
    parentSlug: 'food',
    sortOrder: 33,
  },

  { slug: 'transport', name: 'Transport', kind: 'spending', color: '#eab308', sortOrder: 40 },
  {
    slug: 'gas',
    name: 'Gas',
    kind: 'spending',
    color: '#eab308',
    parentSlug: 'transport',
    sortOrder: 41,
  },
  {
    slug: 'transit',
    name: 'Transit',
    kind: 'spending',
    color: '#facc15',
    parentSlug: 'transport',
    sortOrder: 42,
  },

  {
    slug: 'entertainment',
    name: 'Entertainment',
    kind: 'spending',
    color: '#a855f7',
    sortOrder: 50,
  },
  {
    slug: 'subscriptions',
    name: 'Subscriptions',
    kind: 'spending',
    color: '#a855f7',
    parentSlug: 'entertainment',
    sortOrder: 51,
  },
  {
    slug: 'movies',
    name: 'Movies & Events',
    kind: 'spending',
    color: '#c084fc',
    parentSlug: 'entertainment',
    sortOrder: 52,
  },

  { slug: 'travel', name: 'Travel', kind: 'spending', color: '#ec4899', sortOrder: 60 },
  { slug: 'health', name: 'Health', kind: 'spending', color: '#14b8a6', sortOrder: 70 },
  { slug: 'shopping', name: 'Shopping', kind: 'spending', color: '#f43f5e', sortOrder: 80 },
  {
    slug: 'personal-care',
    name: 'Personal Care',
    kind: 'spending',
    color: '#8b5cf6',
    sortOrder: 90,
  },
  { slug: 'education', name: 'Education', kind: 'spending', color: '#3b82f6', sortOrder: 91 },

  { slug: 'transfer', name: 'Transfer', kind: 'transfer', color: '#94a3b8', sortOrder: 100 },
  {
    slug: 'uncategorized',
    name: 'Uncategorized',
    kind: 'uncategorized',
    color: '#64748b',
    sortOrder: 101,
  },
];

/**
 * Maps the categories a bank reports to the user's categories.
 *
 * Bank categories are never trusted blindly: they only apply when no user
 * rule and no merchant memory match, and their confidence is capped.
 */
export const DEFAULT_BANK_CATEGORY_MAPPING: Readonly<Record<string, string>> = {
  PAYROLL: 'salary',
  INTEREST: 'other-income',
  RENT: 'rent',
  ELECTRICITY: 'utilities',
  UTILITIES: 'utilities',
  INTERNET: 'internet',
  'MOBILE PHONE': 'phone',
  INSURANCE: 'insurance',
  GROCERY: 'groceries',
  RESTAURANT: 'restaurants',
  COFFEE: 'coffee',
  GAS: 'gas',
  ENTERTAINMENT: 'subscriptions',
  TRAVEL: 'travel',
  HEALTH: 'health',
  SHOPPING: 'shopping',
  'PERSONAL CARE': 'personal-care',
  EDUCATION: 'education',
  TRANSFER: 'transfer',
  'CARD PAYMENT': 'transfer',
};
