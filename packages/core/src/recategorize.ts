/**
 * Re-categorization planning.
 *
 * When a rule changes, every transaction it can reach is categorized again.
 * The planning functions here are pure: they decide what *would* change, so
 * the count can be shown before anything is written and the writes can be
 * tested without a database.
 *
 * Two rules hold, always:
 *
 * - A locked assignment (a manual edit) is never overwritten.
 * - The result is deterministic: same input, same rules, same output.
 */

import { categorize, type CategorizationOutcome } from './categorization.ts';
import { merchantKey, normalizeMerchant } from './merchant.ts';
import { ruleMatches, type RuleMatchInput } from './rules.ts';
import type {
  AssignmentSource,
  CategorizationContext,
  CategoryAssignment,
  NormalizedTransaction,
  Rule,
} from './types.ts';

/** A transaction as the pipeline sees it, with its current assignment. */
export interface CategorizableTransaction {
  id: string;
  externalId: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  descriptionRaw: string;
  /** The normalized merchant name, when the transaction has one. */
  merchantDisplayName: string | null;
  /** The bank-provided category, when the source supplied one. */
  sourceCategory: string | null;
  postedAt: Date | null;
  pending: boolean;
  /** The assignment as it stands today. */
  currentAssignment: Pick<
    CategoryAssignment,
    'categoryId' | 'source' | 'confidence' | 'reason' | 'locked'
  > | null;
}

/** One assignment that the pipeline would change. */
export interface PlannedChange {
  transactionId: string;
  /** The category the transaction has now. */
  previousCategoryId: string | null;
  /** The category it would get. */
  next: CategorizationOutcome;
}

/** How a rule would affect the existing data. */
export interface RulePreview {
  /** Transactions the rule matches. */
  matched: number;
  /** Of those, the ones whose category would actually change. */
  wouldChange: number;
  /** Matched transactions with a manual edit, which are never touched. */
  locked: number;
}

/**
 * Converts a stored transaction into the shape the pipeline expects.
 *
 * @example
 * toNormalized(transaction); // NormalizedTransaction
 */
export function toNormalized(transaction: CategorizableTransaction): NormalizedTransaction {
  return {
    externalId: transaction.externalId,
    accountId: transaction.accountId,
    postedAt: transaction.postedAt,
    pending: transaction.pending,
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    descriptionRaw: transaction.descriptionRaw,
    ...(transaction.merchantDisplayName ? { merchantRaw: transaction.merchantDisplayName } : {}),
    ...(transaction.sourceCategory ? { sourceCategory: transaction.sourceCategory } : {}),
  };
}

/**
 * The facts a rule matches on, for one stored transaction.
 *
 * @example
 * matchInputFor(transaction).merchantKey; // "blue bottle coffee"
 */
export function matchInputFor(transaction: CategorizableTransaction): RuleMatchInput {
  const displayName =
    transaction.merchantDisplayName ?? normalizeMerchant(transaction.descriptionRaw);
  return {
    amountMinor: transaction.amountMinor,
    descriptionRaw: transaction.descriptionRaw,
    merchantKey: merchantKey(displayName),
    accountId: transaction.accountId,
  };
}

/**
 * Works out which assignments would change if the rules changed.
 *
 * Manual edits are skipped, and a transaction is only reported when the
 * outcome actually differs from what it has now.
 *
 * @example
 * const changes = planRecategorization(transactions, context);
 * changes.length; // 12
 */
export function planRecategorization(
  transactions: readonly CategorizableTransaction[],
  context: CategorizationContext,
): PlannedChange[] {
  const changes: PlannedChange[] = [];

  for (const transaction of transactions) {
    // A manual edit is final.
    if (transaction.currentAssignment?.locked) continue;

    const outcome = categorize(toNormalized(transaction), context);
    const current = transaction.currentAssignment;

    if (current && current.categoryId === outcome.categoryId && current.source === outcome.source) {
      continue;
    }

    changes.push({
      transactionId: transaction.id,
      previousCategoryId: current?.categoryId ?? null,
      next: outcome,
    });
  }

  return changes;
}

/**
 * Counts what a rule would do to the existing data.
 *
 * Used to show "this rule affects 34 transactions, 12 of them change" before
 * the rule is saved.
 *
 * @example
 * previewRule(rule, transactions, context);
 * // { matched: 34, wouldChange: 12, locked: 3 }
 */
export function previewRule(
  rule: Rule,
  transactions: readonly CategorizableTransaction[],
  context: CategorizationContext,
): RulePreview {
  const changedIds = new Set(
    planRecategorization(transactions, context).map((change) => change.transactionId),
  );

  let matched = 0;
  let wouldChange = 0;
  let locked = 0;

  for (const transaction of transactions) {
    if (!ruleMatches(rule, matchInputFor(transaction))) continue;

    matched += 1;
    if (transaction.currentAssignment?.locked) {
      locked += 1;
    } else if (changedIds.has(transaction.id)) {
      wouldChange += 1;
    }
  }

  return { matched, wouldChange, locked };
}

/**
 * The source a manual assignment carries.
 *
 * @example
 * MANUAL_SOURCE; // "user_manual"
 */
export const MANUAL_SOURCE: AssignmentSource = 'user_manual';
