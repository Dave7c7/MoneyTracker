/**
 * Rule matching.
 *
 * A rule says "transactions like this belong to that category". Rules are the
 * highest-priority signal in the categorization pipeline, so matching must be
 * deterministic: same input, same rules, same rule wins.
 */

import type { Rule } from './types.ts';

/** The facts about a transaction a rule can look at. */
export interface RuleMatchInput {
  amountMinor: number;
  descriptionRaw: string;
  /** Normalized merchant key, e.g. "blue bottle coffee". */
  merchantKey: string;
  accountId: string;
}

/**
 * Counts how many conditions a rule uses. More conditions means more
 * specific, and specific rules win ties on priority.
 *
 * @example
 * ruleSpecificity({ matchMerchant: 'shell', matchDescriptionPattern: null, ... }); // 1
 */
export function ruleSpecificity(rule: Rule): number {
  let specificity = 0;
  if (rule.matchMerchant) specificity += 1;
  if (rule.matchDescriptionPattern) specificity += 1;
  if (rule.minAmountMinor !== null) specificity += 1;
  if (rule.maxAmountMinor !== null) specificity += 1;
  if (rule.accountId) specificity += 1;
  return specificity;
}

/**
 * Checks whether a rule matches a transaction. Disabled rules never match.
 *
 * @example
 * ruleMatches(rule, { amountMinor: -5000, descriptionRaw: 'SHELL OIL 574', merchantKey: 'shell', accountId: 'a1' }); // true
 */
export function ruleMatches(rule: Rule, tx: RuleMatchInput): boolean {
  if (!rule.enabled) return false;

  if (rule.matchMerchant) {
    const needle = rule.matchMerchant.toLowerCase();
    if (!tx.merchantKey.includes(needle)) return false;
  }

  if (rule.matchDescriptionPattern) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(rule.matchDescriptionPattern, 'i');
    } catch {
      // A malformed pattern must not break categorization for everything else.
      return false;
    }
    if (!pattern.test(tx.descriptionRaw)) return false;
  }

  if (rule.minAmountMinor !== null && tx.amountMinor < rule.minAmountMinor) return false;
  if (rule.maxAmountMinor !== null && tx.amountMinor > rule.maxAmountMinor) return false;

  if (rule.accountId && rule.accountId !== tx.accountId) return false;

  return true;
}

/**
 * Picks the winning rule: lowest priority number first, then most specific,
 * then lowest id so ties never depend on array order.
 *
 * @example
 * selectRule([ruleA, ruleB], tx); // ruleB
 */
export function selectRule(rules: readonly Rule[], tx: RuleMatchInput): Rule | null {
  const matching = rules.filter((rule) => ruleMatches(rule, tx));
  if (matching.length === 0) return null;

  matching.sort(
    (a, b) =>
      a.priority - b.priority ||
      ruleSpecificity(b) - ruleSpecificity(a) ||
      a.id.localeCompare(b.id),
  );
  return matching[0] ?? null;
}

/**
 * Counts how many of the given transactions a rule would affect. Used to show
 * a preview before a rule is saved.
 *
 * @example
 * countAffected([rule], transactions); // 12
 */
export function countAffected(rule: Rule, transactions: readonly RuleMatchInput[]): number {
  return transactions.filter((tx) => ruleMatches(rule, tx)).length;
}
