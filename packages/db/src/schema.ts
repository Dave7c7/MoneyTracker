/**
 * Database schema.
 *
 * Money is stored as integer minor units in `bigint` columns. Amounts are
 * signed: negative means money out, positive means money in, for every account
 * type.
 */

import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { CsvMapping } from '@moneytracker/core';

export const accountTypeEnum = pgEnum('account_type', [
  'checking',
  'savings',
  'credit_card',
  'loan',
  'cash',
]);

export const categoryKindEnum = pgEnum('category_kind', [
  'spending',
  'income',
  'transfer',
  'uncategorized',
]);

export const assignmentSourceEnum = pgEnum('assignment_source', [
  'user_manual',
  'user_rule',
  'merchant_memory',
  'bank',
  'ai',
  'transfer_detection',
  'fallback',
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  /** IANA timezone used for monthly buckets. */
  timeZone: text('time_zone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Which adapter produced this account. */
    adapterId: text('adapter_id').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    type: accountTypeEnum('type').notNull(),
    currency: text('currency').notNull(),
    /** Last four digits only. Full numbers never reach the database. */
    mask: text('mask'),
    /** True for credit cards and loans: they reduce net worth. */
    isLiability: boolean('is_liability').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueExternal: uniqueIndex('accounts_user_adapter_external_idx').on(
      table.userId,
      table.adapterId,
      table.externalId,
    ),
  }),
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    kind: categoryKindEnum('kind').notNull().default('spending'),
    /** Hex colour used by charts. */
    color: text('color'),
    /** System categories ship with the app and cannot be deleted. */
    isSystem: boolean('is_system').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueSlug: uniqueIndex('categories_user_slug_idx').on(table.userId, table.slug),
  }),
);

export const merchants = pgTable(
  'merchants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Lowercase normalized name. Unique per user. */
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueKey: uniqueIndex('merchants_user_key_idx').on(table.userId, table.key),
  }),
);

/**
 * The two sides of a transfer.
 *
 * A group links the transactions that move money between the user's own
 * accounts. `source` says whether the group was found by the matcher or
 * marked by the user.
 */
export const transferGroups = pgTable(
  'transfer_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'internal' | 'card_payment' | 'user' */
    kind: text('kind').notNull().default('internal'),
    /** 'detected' | 'user' */
    source: text('source').notNull().default('detected'),
    /** Why the group exists, in words a person can read. */
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('transfer_groups_user_idx').on(table.userId),
  }),
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** Stable id from the source. Unique per account: imports are idempotent. */
    externalId: text('external_id').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    /** Plain UTC date for display and grouping. */
    postedDate: date('posted_date'),
    pending: boolean('pending').notNull().default(false),
    /** Integer minor units. Negative = money out, positive = money in. */
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
    /** Exactly as the source gave it. */
    descriptionRaw: text('description_raw').notNull(),
    merchantRaw: text('merchant_raw'),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'set null' }),
    /** Bank-provided category, if the source supplied one. */
    sourceCategory: text('source_category'),
    sourceAdapter: text('source_adapter').notNull(),
    /** Shared id linking the two sides of a transfer. */
    transferGroupId: uuid('transfer_group_id').references(() => transferGroups.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueExternal: uniqueIndex('transactions_account_external_idx').on(
      table.accountId,
      table.externalId,
    ),
    postedDateIdx: index('transactions_posted_date_idx').on(table.postedDate),
    accountIdx: index('transactions_account_idx').on(table.accountId),
    merchantIdx: index('transactions_merchant_idx').on(table.merchantId),
    userIdx: index('transactions_user_idx').on(table.userId),
  }),
);

export const categoryAssignments = pgTable(
  'category_assignments',
  {
    transactionId: uuid('transaction_id')
      .primaryKey()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    source: assignmentSourceEnum('source').notNull(),
    /** 0..1 */
    confidence: real('confidence').notNull().default(0),
    /** Human-readable explanation, e.g. "Matched your rule: Shell → Gas". */
    reason: text('reason').notNull(),
    /** True for manual edits. Never overwritten by re-categorization. */
    locked: boolean('locked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index('category_assignments_category_idx').on(table.categoryId),
    userIdx: index('category_assignments_user_idx').on(table.userId),
  }),
);

export const rules = pgTable(
  'rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Lower number wins. */
    priority: integer('priority').notNull().default(100),
    enabled: boolean('enabled').notNull().default(true),
    matchMerchant: text('match_merchant'),
    matchDescriptionPattern: text('match_description_pattern'),
    minAmountMinor: bigint('min_amount_minor', { mode: 'number' }),
    maxAmountMinor: bigint('max_amount_minor', { mode: 'number' }),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('rules_user_idx').on(table.userId),
    categoryIdx: index('rules_category_idx').on(table.categoryId),
  }),
);

export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    asOf: timestamp('as_of', { withTimezone: true }).notNull(),
    /** Integer minor units. Negative for liabilities. */
    balanceMinor: bigint('balance_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull(),
  },
  (table) => ({
    uniqueSnapshot: uniqueIndex('balance_snapshots_account_as_of_idx').on(
      table.accountId,
      table.asOf,
    ),
  }),
);

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adapterId: text('adapter_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: text('status').notNull().default('running'),
    error: text('error'),
  },
  (table) => ({
    userIdx: index('sync_runs_user_idx').on(table.userId),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  transactions: many(transactions),
  categories: many(categories),
  merchants: many(merchants),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  transactions: many(transactions),
  balances: many(balanceSnapshots),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  merchant: one(merchants, { fields: [transactions.merchantId], references: [merchants.id] }),
  assignment: one(categoryAssignments, {
    fields: [transactions.id],
    references: [categoryAssignments.transactionId],
  }),
}));

export const categoryAssignmentsRelations = relations(categoryAssignments, ({ one }) => ({
  transaction: one(transactions, {
    fields: [categoryAssignments.transactionId],
    references: [transactions.id],
  }),
  category: one(categories, {
    fields: [categoryAssignments.categoryId],
    references: [categories.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  children: many(categories),
  assignments: many(categoryAssignments),
}));

export const merchantsRelations = relations(merchants, ({ many }) => ({
  transactions: many(transactions),
}));

/**
 * Maps a bank-provided category to one of the user's categories.
 *
 * The bank category is never trusted blindly: it only wins when no user rule
 * and no merchant memory match, and its confidence is capped.
 */
export const bankCategoryMappings = pgTable(
  'bank_category_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The category string exactly as the bank spelled it. */
    sourceCategory: text('source_category').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    uniqueMapping: uniqueIndex('bank_category_mappings_user_source_idx').on(
      table.userId,
      table.sourceCategory,
    ),
  }),
);

/**
 * How one institution's export is laid out.
 *
 * A profile is the user's answer to "what does a file from this bank look
 * like?". It holds the column mapping, the formats and the account the rows
 * belong to, so the next export is read the same way without any guessing.
 */
export const importProfiles = pgTable(
  'import_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The name the user gave the profile, e.g. "SoFi checking". */
    name: text('name').notNull(),
    /** The institution the profile belongs to, e.g. "SoFi". */
    institution: text('institution'),
    /** How to read the file: a CsvMapping. */
    mapping: jsonb('mapping').$type<CsvMapping>().notNull(),
    /**
     * Stable key of the account this profile imports into.
     *
     * It is generated once, so renaming the profile never moves its history
     * to another account.
     */
    accountKey: text('account_key').notNull(),
    /** The name that account is given. */
    accountName: text('account_name').notNull(),
    accountType: accountTypeEnum('account_type').notNull().default('checking'),
    currency: text('currency').notNull().default('USD'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueName: uniqueIndex('import_profiles_user_name_idx').on(table.userId, table.name),
  }),
);
