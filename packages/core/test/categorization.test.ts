import { describe, expect, it } from 'vitest';

import {
  AI_CONFIDENCE_CAP,
  BANK_CONFIDENCE_CAP,
  categorize,
  categorizeWithAi,
  MEMORY_CONFIDENCE,
  needsReview,
  reconcileAssignment,
  REVIEW_CONFIDENCE_THRESHOLD,
} from '../src/categorization.ts';
import type { CategoryAssignment, NormalizedTransaction, Rule } from '../src/types.ts';

function tx(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    externalId: 'ext-1',
    accountId: 'checking-1',
    postedAt: new Date('2026-01-15T12:00:00Z'),
    pending: false,
    amountMinor: -4500,
    currency: 'USD',
    descriptionRaw: 'SQ *BLUE BOTTLE COFFEE #12',
    ...overrides,
  };
}

const shellRule: Rule = {
  id: 'rule-shell',
  name: 'Shell → Gas',
  priority: 10,
  enabled: true,
  matchMerchant: 'shell',
  matchDescriptionPattern: null,
  minAmountMinor: null,
  maxAmountMinor: null,
  accountId: null,
  categoryId: 'cat-gas',
};

const coffeeRule: Rule = {
  id: 'rule-coffee',
  name: 'Coffee',
  priority: 5,
  enabled: true,
  matchMerchant: 'coffee',
  matchDescriptionPattern: null,
  minAmountMinor: null,
  maxAmountMinor: null,
  accountId: null,
  categoryId: 'cat-coffee',
};

describe('categorization pipeline', () => {
  it('lets a user rule beat everything else', () => {
    const outcome = categorize(tx({ descriptionRaw: 'SHELL OIL 574' }), {
      rules: [shellRule],
      merchantMemory: new Map([['shell', { categoryId: 'cat-dining' }]]),
      bankCategoryMap: new Map([['FOOD AND DRINK', 'cat-bank-food']]),
      uncategorizedCategoryId: 'cat-uncategorized',
    });

    expect(outcome.source).toBe('user_rule');
    expect(outcome.categoryId).toBe('cat-gas');
    expect(outcome.confidence).toBe(1);
    expect(outcome.reason).toBe('Matched your rule: Shell → Gas');
  });

  it('uses merchant memory when no rule matches', () => {
    const outcome = categorize(tx(), {
      rules: [shellRule],
      merchantMemory: new Map([
        ['blue bottle coffee', { categoryId: 'cat-dining', displayName: 'Dining Out' }],
      ]),
      bankCategoryMap: new Map([['FOOD AND DRINK', 'cat-bank-food']]),
      uncategorizedCategoryId: 'cat-uncategorized',
    });

    expect(outcome.source).toBe('merchant_memory');
    expect(outcome.categoryId).toBe('cat-dining');
    expect(outcome.confidence).toBe(MEMORY_CONFIDENCE);
    expect(outcome.reason).toContain('Dining Out');
  });

  it('uses the bank category when nothing better exists, capped at 0.7', () => {
    const outcome = categorize(tx({ sourceCategory: 'FOOD AND DRINK' }), {
      bankCategoryMap: new Map([['FOOD AND DRINK', 'cat-bank-food']]),
      uncategorizedCategoryId: 'cat-uncategorized',
    });

    expect(outcome.source).toBe('bank');
    expect(outcome.categoryId).toBe('cat-bank-food');
    expect(outcome.confidence).toBe(BANK_CONFIDENCE_CAP);
    expect(outcome.confidence).toBeLessThanOrEqual(0.7);
  });

  it('falls back to Uncategorized with zero confidence', () => {
    const outcome = categorize(tx(), { uncategorizedCategoryId: 'cat-uncategorized' });

    expect(outcome.source).toBe('fallback');
    expect(outcome.categoryId).toBe('cat-uncategorized');
    expect(outcome.confidence).toBe(0);
  });

  it('is deterministic: the same input gives the same output', () => {
    const context = {
      rules: [shellRule, coffeeRule],
      uncategorizedCategoryId: 'cat-uncategorized',
    };
    expect(categorize(tx(), context)).toEqual(categorize(tx(), context));
  });

  it('ignores disabled rules', () => {
    const outcome = categorize(tx(), {
      rules: [{ ...coffeeRule, enabled: false }],
      uncategorizedCategoryId: 'cat-uncategorized',
    });
    expect(outcome.source).toBe('fallback');
  });
});

describe('categorization with AI', () => {
  it('only asks the AI when nothing else matched', async () => {
    let called = false;
    const outcome = await categorizeWithAi(tx(), {
      uncategorizedCategoryId: 'cat-uncategorized',
      aiCategorizer: {
        suggest: async () => {
          called = true;
          return { categoryId: 'cat-ai', confidence: 0.9, reason: 'looks like coffee' };
        },
      },
    });

    expect(called).toBe(true);
    expect(outcome.source).toBe('ai');
    // The AI must never be stronger than rules, memory or bank categories.
    expect(outcome.confidence).toBe(AI_CONFIDENCE_CAP);
    expect(outcome.confidence).toBeLessThanOrEqual(BANK_CONFIDENCE_CAP);
  });

  it('does not ask the AI when a rule already matched', async () => {
    let called = false;
    const outcome = await categorizeWithAi(tx(), {
      rules: [coffeeRule],
      uncategorizedCategoryId: 'cat-uncategorized',
      aiCategorizer: {
        suggest: async () => {
          called = true;
          return { categoryId: 'cat-ai', confidence: 0.9, reason: 'looks like coffee' };
        },
      },
    });

    expect(called).toBe(false);
    expect(outcome.source).toBe('user_rule');
  });

  it('treats an AI failure as no suggestion', async () => {
    const outcome = await categorizeWithAi(tx(), {
      uncategorizedCategoryId: 'cat-uncategorized',
      aiCategorizer: {
        suggest: async () => {
          throw new Error('provider unavailable');
        },
      },
    });

    expect(outcome.source).toBe('fallback');
    expect(outcome.categoryId).toBe('cat-uncategorized');
  });
});

describe('locked assignments', () => {
  const manual: CategoryAssignment = {
    transactionId: 'tx-1',
    categoryId: 'cat-dining',
    source: 'user_manual',
    confidence: 1,
    reason: 'Set by you',
    locked: true,
  };

  it('never overwrites a manual edit', () => {
    const next = {
      categoryId: 'cat-gas',
      source: 'user_rule' as const,
      confidence: 1,
      reason: 'rule',
    };
    expect(reconcileAssignment(manual, next)).toBe(manual);
    expect(reconcileAssignment(manual, next).categoryId).toBe('cat-dining');
  });

  it('replaces an unlocked assignment', () => {
    const unlocked: CategoryAssignment = { ...manual, locked: false, categoryId: 'cat-old' };
    const next = {
      categoryId: 'cat-new',
      source: 'user_rule' as const,
      confidence: 1,
      reason: 'rule',
    };
    expect(reconcileAssignment(unlocked, next).categoryId).toBe('cat-new');
  });

  it('creates an assignment when there was none', () => {
    const next = {
      categoryId: 'cat-new',
      source: 'bank' as const,
      confidence: 0.7,
      reason: 'bank',
    };
    expect(reconcileAssignment(null, next).categoryId).toBe('cat-new');
  });
});

describe('review inbox threshold', () => {
  it('sends low-confidence assignments to review', () => {
    expect(needsReview({ confidence: 0.5 })).toBe(true);
    expect(needsReview({ confidence: REVIEW_CONFIDENCE_THRESHOLD })).toBe(false);
    expect(needsReview({ confidence: 1 })).toBe(false);
  });
});
