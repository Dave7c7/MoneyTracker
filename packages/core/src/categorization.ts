/**
 * The categorization pipeline.
 *
 * Strict priority order, stopping at the first step that produces a result:
 *
 *   1. user rules          (confidence 1.0)
 *   2. merchant memory     (confidence 0.9)
 *   3. bank category       (confidence capped at 0.7)
 *   4. AI suggestion       (confidence capped below the others, optional)
 *   5. fallback            (Uncategorized, confidence 0)
 *
 * Every assignment carries its source and a human-readable reason, so the UI
 * can always explain why a transaction was categorized the way it was.
 */

import { merchantKey, normalizeMerchant } from './merchant.ts';
import { selectRule, type RuleMatchInput } from './rules.ts';
import type {
  AssignmentSource,
  CategorizationContext,
  CategoryAssignment,
  Categorizer,
  NormalizedTransaction,
} from './types.ts';

/** Confidence assigned to a user rule match. Rules are authoritative. */
export const RULE_CONFIDENCE = 1;
/** Confidence assigned to merchant memory. */
export const MEMORY_CONFIDENCE = 0.9;
/** Highest confidence a bank-provided category may ever get. */
export const BANK_CONFIDENCE_CAP = 0.7;
/** Highest confidence an AI suggestion may ever get. */
export const AI_CONFIDENCE_CAP = 0.65;
/** Below this confidence a transaction lands in the review inbox. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.8;

/** The outcome of categorizing one transaction. */
export interface CategorizationOutcome {
  categoryId: string;
  source: AssignmentSource;
  confidence: number;
  reason: string;
}

function categoryName(ctx: CategorizationContext, categoryId: string): string {
  return ctx.categoryNames?.get(categoryId) ?? categoryId;
}

function merchantDisplayName(tx: NormalizedTransaction): string {
  return tx.merchantRaw ?? normalizeMerchant(tx.descriptionRaw);
}

function matchInputFor(tx: NormalizedTransaction): RuleMatchInput {
  return {
    amountMinor: tx.amountMinor,
    descriptionRaw: tx.descriptionRaw,
    merchantKey: merchantKey(merchantDisplayName(tx)),
    accountId: tx.accountId,
  };
}

/**
 * Categorizes one transaction synchronously, stopping at the first match.
 *
 * The optional AI step is not consulted here; use `categorizeWithAi` when an
 * AI provider is configured.
 *
 * @example
 * categorize(tx, { rules: [shellRule], uncategorizedCategoryId: 'uncategorized' });
 * // { categoryId: 'gas', source: 'user_rule', confidence: 1, reason: 'Matched your rule: Shell → Gas' }
 */
export function categorize(
  tx: NormalizedTransaction,
  ctx: CategorizationContext,
): CategorizationOutcome {
  // 1. User rules always win.
  const rule = ctx.rules ? selectRule(ctx.rules, matchInputFor(tx)) : null;
  if (rule) {
    return {
      categoryId: rule.categoryId,
      source: 'user_rule',
      confidence: RULE_CONFIDENCE,
      reason: `Matched your rule: ${rule.name}`,
    };
  }

  // 2. Merchant memory: what the user chose for this merchant last time.
  const memory = ctx.merchantMemory?.get(matchInputFor(tx).merchantKey);
  if (memory) {
    return {
      categoryId: memory.categoryId,
      source: 'merchant_memory',
      confidence: MEMORY_CONFIDENCE,
      reason: `You categorized ${merchantDisplayName(tx)} as ${memory.displayName ?? categoryName(ctx, memory.categoryId)} before`,
    };
  }

  // 3. Bank-provided category, mapped through a table and capped.
  if (tx.sourceCategory) {
    const mapped = ctx.bankCategoryMap?.get(tx.sourceCategory.toUpperCase());
    if (mapped) {
      return {
        categoryId: mapped,
        source: 'bank',
        confidence: BANK_CONFIDENCE_CAP,
        reason: `Bank category "${tx.sourceCategory}" → ${categoryName(ctx, mapped)}`,
      };
    }
  }

  // 5. Fallback: goes to the review inbox.
  return {
    categoryId: ctx.uncategorizedCategoryId,
    source: 'fallback',
    confidence: 0,
    reason: 'No rule, memory or bank category matched',
  };
}

/**
 * Categorizes a transaction, consulting the optional AI categorizer only when
 * nothing better was found. The AI suggestion always has lower confidence
 * than rules, memory and bank categories.
 *
 * @example
 * const outcome = await categorizeWithAi(tx, { ...ctx, aiCategorizer });
 */
export async function categorizeWithAi(
  tx: NormalizedTransaction,
  ctx: CategorizationContext & { aiCategorizer?: Categorizer },
): Promise<CategorizationOutcome> {
  const outcome = categorize(tx, ctx);
  if (outcome.source !== 'fallback' || !ctx.aiCategorizer) {
    return outcome;
  }

  let suggestion: { categoryId: string; confidence: number; reason: string } | null = null;
  try {
    suggestion = await ctx.aiCategorizer.suggest(tx, ctx);
  } catch {
    // An AI failure is never fatal: fall back to Uncategorized.
    return outcome;
  }
  if (!suggestion) return outcome;

  return {
    categoryId: suggestion.categoryId,
    source: 'ai',
    confidence: Math.min(AI_CONFIDENCE_CAP, suggestion.confidence),
    reason: `AI suggested ${categoryName(ctx, suggestion.categoryId)}: ${suggestion.reason}`,
  };
}

/**
 * Applies a fresh outcome to an existing assignment.
 *
 * Manual edits are locked: a locked assignment is never overwritten, no
 * matter what the pipeline says.
 *
 * @example
 * reconcileAssignment(lockedAssignment, nextOutcome); // the locked assignment, unchanged
 */
export function reconcileAssignment(
  existing: CategoryAssignment | null,
  next: CategorizationOutcome,
): CategoryAssignment {
  if (existing?.locked) {
    return existing;
  }
  return {
    transactionId: existing?.transactionId ?? '',
    categoryId: next.categoryId,
    source: next.source,
    confidence: next.confidence,
    reason: next.reason,
    locked: false,
  };
}

/**
 * True when an assignment should show up in the review inbox.
 *
 * @example
 * needsReview({ confidence: 0.5 }); // true
 */
export function needsReview(
  assignment: Pick<CategoryAssignment, 'confidence'>,
  threshold = REVIEW_CONFIDENCE_THRESHOLD,
): boolean {
  return assignment.confidence < threshold;
}
