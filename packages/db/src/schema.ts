/**
 * Database schema.
 *
 * Money is stored as integer minor units in `bigint` columns. Amounts are
 * signed: negative means money out, positive means money in, for every account
 * type.
 */

import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
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
  /**
   * The scrypt hash of the password, never the password.
   *
   * It is null until the password is set the first time, which is what makes
   * the app safe before it is claimed.
   */
  passwordHash: text('password_hash'),
  /** Failed attempts since the last success. Reset when signing in works. */
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  /** When signing in is allowed again, after too many failed attempts. */
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  /** When the password last signed in. */
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /**
   * The shared secret of the authenticator app, encrypted with
   * `ENCRYPTION_KEY` before it is stored. Null until two-factor is started.
   */
  totpSecretEncrypted: text('totp_secret_encrypted'),
  /** When a code from the app first confirmed the secret; null while off. */
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  /**
   * The last thirty-second step a code was accepted from.
   *
   * A code stays valid for its step, so without this the same digits could be
   * used twice by someone who watched them go by.
   */
  totpLastStep: integer('totp_last_step'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A signed-in session.
 *
 * The cookie holds a random token; the table holds only its SHA-256, so a copy
 * of the database cannot be turned back into a working cookie.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token in the cookie, hex. */
    tokenHash: text('token_hash').notNull(),
    /** When the session stops being accepted. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** When the session was last used, for "signed in on" lists. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** The address that signed in, when the server can see it. */
    createdIp: text('created_ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueToken: uniqueIndex('sessions_token_hash_idx').on(table.tokenHash),
    userIdx: index('sessions_user_idx').on(table.userId),
  }),
);

/**
 * Something the app noticed and wants to say.
 *
 * The checker runs on a timer and says the same facts again; `dedupeKey` is
 * what makes that cheap, because the database refuses a second alert with the
 * same key. Whether it was read, and whether the webhook took it, are here too,
 * so a failed delivery is retried instead of lost.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'budget' | 'sync' | 'large-transaction' | 'recurring' */
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** A path in this app, or null when there is nowhere useful to go. */
    href: text('href'),
    /** Stable identity of the fact, unique per user. */
    dedupeKey: text('dedupe_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** When the person saw it; null while it is still new. */
    readAt: timestamp('read_at', { withTimezone: true }),
    /** When the webhook took it; null while there is one to send or a retry due. */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    notifyAttempts: integer('notify_attempts').notNull().default(0),
    /** Why the last delivery failed, for the log and the screen. */
    lastNotifyError: text('last_notify_error'),
  },
  (table) => ({
    uniqueKey: uniqueIndex('alerts_user_dedupe_idx').on(table.userId, table.dedupeKey),
    userCreatedIdx: index('alerts_user_created_idx').on(table.userId, table.createdAt),
  }),
);

/**
 * A recovery code for two-factor sign-in.
 *
 * The code is shown once, when two-factor is turned on. What is stored is its
 * SHA-256, so a copy of the database cannot be used to sign in with one.
 */
export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the code, hex. */
    codeHash: text('code_hash').notNull(),
    /** When it was used; null while it still works. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('recovery_codes_user_idx').on(table.userId),
    uniqueHash: uniqueIndex('recovery_codes_hash_idx').on(table.codeHash),
  }),
);

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
    // The dashboards read one month of one user at a time.
    userPostedDateIdx: index('transactions_user_posted_date_idx').on(
      table.userId,
      table.postedDate,
    ),
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

/**
 * A live connection to a data provider.
 *
 * One connection is one provider account: it has its own credential, its own
 * refresh rhythm and its own history window. Many connections can live in one
 * install, and every account belongs to exactly one of them.
 */
export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Which provider serves this connection, e.g. "simplefin". */
    adapterId: text('adapter_id').notNull(),
    /** The name the user gave the connection, e.g. "SoFi checking". */
    name: text('name').notNull(),
    /** The institution behind it, e.g. "SoFi". */
    institution: text('institution'),
    /** The provider's token, encrypted. Never shown in the app. */
    credentialCiphertext: text('credential_ciphertext').notNull(),
    /** 'active' | 'error' | 'disabled' */
    status: text('status').notNull().default('active'),
    /** When the last successful sync finished. */
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    /** What went wrong, in words. Never contains the credential. */
    lastError: text('last_error'),
    /** How far back this provider can reach, in days. */
    historyDays: integer('history_days').notNull().default(90),
    /** How often the provider refreshes, in hours. */
    refreshHours: integer('refresh_hours').notNull().default(24),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('connections_user_idx').on(table.userId),
    adapterIdx: index('connections_adapter_idx').on(table.adapterId),
  }),
);

/**
 * Which accounts a connection feeds.
 *
 * An account belongs to one connection: when a provider covers an account
 * that was imported from a file, the provider becomes the one that owns it.
 */
export const connectionAccounts = pgTable(
  'connection_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueAccount: uniqueIndex('connection_accounts_account_idx').on(table.accountId),
    connectionIdx: index('connection_accounts_connection_idx').on(table.connectionId),
  }),
);

/**
 * A recurring charge: a subscription, a bill, or something the app found that
 * looks like one.
 *
 * The status is the user's decision. A dismissed item is never detected
 * again, and a confirmed one is never overwritten.
 */
export const recurringItems = pgTable(
  'recurring_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Stable key of the item: the account and the merchant together. */
    key: text('key').notNull(),
    /** The merchant key, when the item was found from transactions. */
    merchantKey: text('merchant_key'),
    /** The name shown in the app. */
    merchantName: text('merchant_name').notNull(),
    /** The description of the last charge, for a manual bill. */
    descriptionRaw: text('description_raw'),
    /** The account the charge lands on, when it is known. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    /** 'weekly' | 'monthly' | 'annual' */
    cadence: text('cadence').notNull().default('monthly'),
    /** 'detected' | 'confirmed' | 'dismissed' */
    status: text('status').notNull().default('detected'),
    /** The current price, as a positive number of minor units. */
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('USD'),
    /** How many charges were found. */
    occurrences: integer('occurrences').notNull().default(0),
    firstDate: date('first_date'),
    lastDate: date('last_date'),
    /** The date the next charge is expected. */
    nextDate: date('next_date').notNull(),
    /** True when the price moved by more than five percent. */
    priceChanged: boolean('price_changed').notNull().default(false),
    /** The price before the change. */
    previousAmountMinor: bigint('previous_amount_minor', { mode: 'number' }),
    /** 0..1 */
    confidence: real('confidence').notNull().default(0),
    /** Why the app thinks this is recurring, in words. */
    reason: text('reason'),
    /** True for a bill the user added by hand. */
    isManual: boolean('is_manual').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueKey: uniqueIndex('recurring_items_user_key_idx').on(table.userId, table.key),
    userIdx: index('recurring_items_user_idx').on(table.userId),
    nextDateIdx: index('recurring_items_next_date_idx').on(table.nextDate),
  }),
);

/**
 * A monthly budget for one category.
 *
 * The budget is a limit the user set, not a promise: the app shows what has
 * been spent against it.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    /** The budget for one month, in minor units. */
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    /** When true, money left over is added to the next month. */
    rollover: boolean('rollover').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueCategory: uniqueIndex('budgets_user_category_idx').on(table.userId, table.categoryId),
    userIdx: index('budgets_user_idx').on(table.userId),
    // A budget of nothing is not a budget.
    positiveAmount: check('budgets_amount_positive', sql`${table.amountMinor} > 0`),
  }),
);

/**
 * A savings goal.
 *
 * The goal is tracking only: the app never moves money. Progress is either
 * what the user says they set aside, or the balance of a linked account.
 */
export const savingsGoals = pgTable(
  'savings_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The amount the user wants to reach, in minor units. */
    targetMinor: bigint('target_minor', { mode: 'number' }).notNull(),
    /** What the user says they have set aside, in minor units. */
    savedMinor: bigint('saved_minor', { mode: 'number' }).notNull().default(0),
    /** The account the progress is read from, when it is linked. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** The day the goal should be reached. */
    deadline: date('deadline'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('savings_goals_user_idx').on(table.userId),
    // A goal of nothing is not a goal.
    positiveTarget: check('savings_goals_target_positive', sql`${table.targetMinor} > 0`),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  transactions: many(transactions),
  categories: many(categories),
  merchants: many(merchants),
  recoveryCodes: many(recoveryCodes),
  alerts: many(alerts),
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
 * The parts of a split transaction.
 *
 * A split never changes the row the bank gave us. The parts live next to it
 * and always add up to its amount.
 */
export const splitLines = pgTable(
  'split_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    /** Signed amount in minor units. The parts add up to the transaction. */
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    transactionIdx: index('split_lines_transaction_idx').on(table.transactionId),
    userIdx: index('split_lines_user_idx').on(table.userId),
    // A part of nothing is not a part. The sum of the parts has to equal the
    // transaction, and that is checked in code, where the parent is known.
    nonZeroAmount: check('split_lines_amount_not_zero', sql`${table.amountMinor} <> 0`),
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
