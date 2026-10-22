/**
 * Core domain types.
 *
 * These are the contracts that every layer shares: adapters produce
 * `Normalized*` values, the database stores them, and the UI reads them back.
 * Nothing in this file may import from `apps/` or `packages/db`.
 */

/** Account kinds the tracker understands. */
export type AccountType = 'checking' | 'savings' | 'credit_card' | 'loan' | 'cash';

/**
 * What a category *is* for accounting purposes.
 *
 * - `spending`: money that leaves the household for goods and services.
 * - `income`: money that arrives as earnings.
 * - `transfer`: money moving between the user's own accounts. Never spending.
 * - `uncategorized`: the fallback bucket that feeds the review inbox.
 */
export type CategoryKind = 'spending' | 'income' | 'transfer' | 'uncategorized';

/** Where a category assignment came from. Always explainable. */
export type AssignmentSource =
  | 'user_manual'
  | 'user_rule'
  | 'merchant_memory'
  | 'bank'
  | 'ai'
  | 'transfer_detection'
  | 'fallback';

/**
 * How a transaction is known to be a transfer.
 *
 * - `confirmed`: both sides of the transfer were found.
 * - `suspected`: it looks like a transfer, but no other side was found.
 * - `user`: the user said so.
 */
export type TransferState = 'confirmed' | 'suspected' | 'user';

/** An account as exposed by a data source. */
export interface NormalizedAccount {
  /** Stable id from the source. Required for idempotent imports. */
  externalId: string;
  name: string;
  type: AccountType;
  /** ISO 4217 currency code. */
  currency: string;
  /** Last four digits only. Full account numbers never leave the adapter. */
  mask?: string;
  /** True for credit cards and loans: these reduce net worth. */
  isLiability?: boolean;
}

/** A balance snapshot for an account at a point in time. */
export interface NormalizedBalance {
  accountExternalId: string;
  asOf: Date;
  /** Integer minor units (cents). Negative for liabilities. */
  balanceMinor: number;
  currency: string;
}

/**
 * A transaction as produced by a data source.
 *
 * Amounts are integer minor units. Negative means money out, positive means
 * money in, for every account type: a credit card purchase is negative.
 */
export interface NormalizedTransaction {
  /** Stable id from the source; derive a deterministic hash if none exists. */
  externalId: string;
  accountId: string;
  /** UTC timestamp. Null while the transaction is pending. */
  postedAt: Date | null;
  pending: boolean;
  amountMinor: number;
  currency: string;
  /** Exactly as the source gave it. Never cleaned in place. */
  descriptionRaw: string;
  /** Optional cleaned merchant name, if the source supplies one. */
  merchantRaw?: string;
  /** Bank-provided category, if any. */
  sourceCategory?: string;
  /**
   * Set by the app, not by adapters: the transaction moves money between the
   * user's own accounts, so it is never spending.
   */
  transferState?: TransferState | null;
}

/**
 * The single interface every data source implements.
 *
 * Adding a new source means writing one adapter; no other file changes.
 */
export interface DataSourceAdapter {
  /** "mock" | "csv" | "sofi-plaid" ... */
  id: string;
  fetchAccounts(): Promise<NormalizedAccount[]>;
  fetchTransactions(accountId: string, since?: Date): Promise<NormalizedTransaction[]>;
  fetchBalances?(): Promise<NormalizedBalance[]>;
}

/**
 * Everything the categorization pipeline may consult.
 *
 * All parts are optional except `uncategorizedCategoryId`, which is the
 * fallback bucket every unmatched transaction lands in.
 */
export interface CategorizationContext {
  /** User rules, highest priority. */
  rules?: readonly Rule[];
  /** Normalized merchant key -> category the user picked before. */
  merchantMemory?: ReadonlyMap<string, { categoryId: string; displayName?: string }>;
  /** Bank-provided category string -> category id. */
  bankCategoryMap?: ReadonlyMap<string, string>;
  /** Display names for categories, used to build explanations. */
  categoryNames?: ReadonlyMap<string, string>;
  /** The category that means "money moved between the user's own accounts". */
  transferCategoryId?: string;
  /** Category id used when nothing matches. */
  uncategorizedCategoryId: string;
}

/** Optional AI/LLM categorizer. Off by default; provider is swappable. */
export interface Categorizer {
  suggest(
    tx: NormalizedTransaction,
    context: CategorizationContext,
  ): Promise<{ categoryId: string; confidence: number; reason: string } | null>;
}

/** A category in the user's tree. */
export interface Category {
  id: string;
  name: string;
  slug: string;
  kind: CategoryKind;
  parentId: string | null;
  /** Hex colour used by charts. */
  color: string | null;
}

/** A merchant known to the app, keyed by its normalized name. */
export interface Merchant {
  id: string;
  /** Lowercase normalized name. Unique. */
  key: string;
  /** Human-readable normalized name. */
  displayName: string;
}

/** A stored transaction with its resolved category assignment. */
export interface Transaction {
  id: string;
  accountId: string;
  externalId: string;
  postedAt: Date | null;
  /** Plain UTC date (YYYY-MM-DD) for display and grouping. */
  postedDate: string | null;
  pending: boolean;
  amountMinor: number;
  currency: string;
  descriptionRaw: string;
  merchantRaw: string | null;
  merchantId: string | null;
  sourceCategory: string | null;
  transferGroupId: string | null;
}

/** A category assignment. Always carries the reason it was made. */
export interface CategoryAssignment {
  transactionId: string;
  categoryId: string;
  source: AssignmentSource;
  /** 0..1 */
  confidence: number;
  reason: string;
  /** True for manual edits. Never overwritten by re-categorization. */
  locked: boolean;
}

/**
 * A user rule. Lower `priority` wins; ties are broken by specificity.
 */
export interface Rule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  /** Case-insensitive substring match against the normalized merchant. */
  matchMerchant: string | null;
  /** Case-insensitive regular expression matched against the raw description. */
  matchDescriptionPattern: string | null;
  /** Inclusive amount range in minor units. */
  minAmountMinor: number | null;
  maxAmountMinor: number | null;
  /** Restrict to one account. */
  accountId: string | null;
  categoryId: string;
}
