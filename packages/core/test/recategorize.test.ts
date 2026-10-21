import { describe, expect, it } from 'vitest';

import {
  MANUAL_SOURCE,
  matchInputFor,
  planRecategorization,
  previewRule,
  toNormalized,
  type CategorizableTransaction,
} from '../src/recategorize.ts';
import type { CategorizationContext, Rule } from '../src/types.ts';

function transaction(overrides: Partial<CategorizableTransaction> = {}): CategorizableTransaction {
  return {
    id: 'tx-1',
    externalId: 'ext-1',
    accountId: 'checking-1',
    amountMinor: -4500,
    currency: 'USD',
    descriptionRaw: 'SHELL OIL 574',
    merchantDisplayName: 'Shell',
    sourceCategory: null,
    postedAt: new Date('2026-01-15T12:00:00Z'),
    pending: false,
    currentAssignment: null,
    ...overrides,
  };
}

const gasRule: Rule = {
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

const context: CategorizationContext = {
  rules: [gasRule],
  uncategorizedCategoryId: 'cat-uncategorized',
};

describe('planRecategorization', () => {
  it('categorizes transactions that have no assignment yet', () => {
    const changes = planRecategorization([transaction()], context);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.transactionId).toBe('tx-1');
    expect(changes[0]?.next.categoryId).toBe('cat-gas');
    expect(changes[0]?.next.source).toBe('user_rule');
    expect(changes[0]?.previousCategoryId).toBeNull();
  });

  it('never overwrites a manual edit', () => {
    const locked = transaction({
      currentAssignment: {
        categoryId: 'cat-dining',
        source: MANUAL_SOURCE,
        confidence: 1,
        reason: 'Set by you',
        locked: true,
      },
    });

    expect(planRecategorization([locked], context)).toEqual([]);
  });

  it('reports no change when the outcome matches the current assignment', () => {
    const already = transaction({
      currentAssignment: {
        categoryId: 'cat-gas',
        source: 'user_rule',
        confidence: 1,
        reason: 'Matched your rule: Shell → Gas',
        locked: false,
      },
    });

    expect(planRecategorization([already], context)).toEqual([]);
  });

  it('re-categorizes when the rule changes the outcome', () => {
    const before = transaction({
      currentAssignment: {
        categoryId: 'cat-uncategorized',
        source: 'fallback',
        confidence: 0,
        reason: 'No rule matched',
        locked: false,
      },
    });

    const changes = planRecategorization([before], context);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.previousCategoryId).toBe('cat-uncategorized');
    expect(changes[0]?.next.categoryId).toBe('cat-gas');
  });

  it('is deterministic', () => {
    const transactions = [transaction(), transaction({ id: 'tx-2', externalId: 'ext-2' })];
    expect(planRecategorization(transactions, context)).toEqual(
      planRecategorization(transactions, context),
    );
  });

  it('falls back to Uncategorized when nothing matches', () => {
    const changes = planRecategorization(
      [transaction({ descriptionRaw: 'SQ *MYSTERY SHOP', merchantDisplayName: 'Mystery Shop' })],
      context,
    );

    expect(changes[0]?.next.categoryId).toBe('cat-uncategorized');
    expect(changes[0]?.next.source).toBe('fallback');
    expect(changes[0]?.next.confidence).toBe(0);
  });
});

describe('previewRule', () => {
  it('counts how many transactions a rule affects', () => {
    const transactions = [
      transaction({ id: 'a', currentAssignment: null }),
      transaction({ id: 'b', currentAssignment: null }),
      transaction({ id: 'c', descriptionRaw: 'SQ *OTHER', merchantDisplayName: 'Other' }),
    ];

    const preview = previewRule(gasRule, transactions, context);

    expect(preview.matched).toBe(2);
    expect(preview.wouldChange).toBe(2);
    expect(preview.locked).toBe(0);
  });

  it('counts locked transactions separately', () => {
    const transactions = [
      transaction({
        id: 'a',
        currentAssignment: {
          categoryId: 'cat-dining',
          source: MANUAL_SOURCE,
          confidence: 1,
          reason: 'Set by you',
          locked: true,
        },
      }),
      transaction({ id: 'b', currentAssignment: null }),
    ];

    const preview = previewRule(gasRule, transactions, context);

    expect(preview.matched).toBe(2);
    expect(preview.locked).toBe(1);
    // The locked one would have changed, but it never will.
    expect(preview.wouldChange).toBe(1);
  });
});

describe('helpers', () => {
  it('builds the match input from the stored merchant', () => {
    expect(matchInputFor(transaction()).merchantKey).toBe('shell');
  });

  it('falls back to the description when there is no merchant', () => {
    expect(
      matchInputFor(
        transaction({ merchantDisplayName: null, descriptionRaw: 'SQ *BLUE BOTTLE COFFEE #12' }),
      ).merchantKey,
    ).toBe('blue bottle coffee');
  });

  it('converts to the normalized transaction shape', () => {
    const normalized = toNormalized(transaction({ sourceCategory: 'GAS' }));
    expect(normalized.merchantRaw).toBe('Shell');
    expect(normalized.sourceCategory).toBe('GAS');
    expect(normalized.amountMinor).toBe(-4500);
  });
});
