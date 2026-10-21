import { describe, expect, it } from 'vitest';

import { countAffected, ruleMatches, ruleSpecificity, selectRule } from '../src/rules.ts';
import type { Rule } from '../src/types.ts';

const baseRule: Rule = {
  id: 'rule-1',
  name: 'Rule',
  priority: 10,
  enabled: true,
  matchMerchant: null,
  matchDescriptionPattern: null,
  minAmountMinor: null,
  maxAmountMinor: null,
  accountId: null,
  categoryId: 'cat-1',
};

const transaction = {
  amountMinor: -5000,
  descriptionRaw: 'SHELL OIL 574',
  merchantKey: 'shell',
  accountId: 'checking-1',
};

describe('rule matching', () => {
  it('matches on merchant', () => {
    expect(ruleMatches({ ...baseRule, matchMerchant: 'shell' }, transaction)).toBe(true);
    expect(ruleMatches({ ...baseRule, matchMerchant: 'coffee' }, transaction)).toBe(false);
  });

  it('matches on description pattern', () => {
    expect(ruleMatches({ ...baseRule, matchDescriptionPattern: '^SHELL' }, transaction)).toBe(true);
    expect(ruleMatches({ ...baseRule, matchDescriptionPattern: 'coffee' }, transaction)).toBe(
      false,
    );
  });

  it('matches on an amount range', () => {
    expect(
      ruleMatches({ ...baseRule, minAmountMinor: -10000, maxAmountMinor: -1000 }, transaction),
    ).toBe(true);
    expect(ruleMatches({ ...baseRule, minAmountMinor: -1000 }, transaction)).toBe(false);
  });

  it('matches on account', () => {
    expect(ruleMatches({ ...baseRule, accountId: 'checking-1' }, transaction)).toBe(true);
    expect(ruleMatches({ ...baseRule, accountId: 'savings-1' }, transaction)).toBe(false);
  });

  it('never matches a disabled rule', () => {
    expect(ruleMatches({ ...baseRule, enabled: false, matchMerchant: 'shell' }, transaction)).toBe(
      false,
    );
  });

  it('ignores a malformed description pattern instead of throwing', () => {
    expect(ruleMatches({ ...baseRule, matchDescriptionPattern: '([' }, transaction)).toBe(false);
  });

  it('scores specificity by the number of conditions used', () => {
    expect(ruleSpecificity(baseRule)).toBe(0);
    expect(ruleSpecificity({ ...baseRule, matchMerchant: 'shell' })).toBe(1);
    expect(
      ruleSpecificity({
        ...baseRule,
        matchMerchant: 'shell',
        matchDescriptionPattern: 'x',
        accountId: 'a',
      }),
    ).toBe(3);
  });
});

describe('rule conflicts', () => {
  const lowPriority = {
    ...baseRule,
    id: 'a-low',
    priority: 20,
    matchMerchant: 'shell',
    categoryId: 'cat-low',
  };
  const highPriority = {
    ...baseRule,
    id: 'b-high',
    priority: 5,
    matchMerchant: 'shell',
    categoryId: 'cat-high',
  };
  const moreSpecific = {
    ...baseRule,
    id: 'c-specific',
    priority: 20,
    matchMerchant: 'shell',
    matchDescriptionPattern: 'SHELL OIL',
    categoryId: 'cat-specific',
  };

  it('gives the win to the lower priority number', () => {
    expect(selectRule([lowPriority, highPriority], transaction)?.id).toBe('b-high');
  });

  it('breaks a priority tie with specificity', () => {
    expect(selectRule([lowPriority, moreSpecific], transaction)?.id).toBe('c-specific');
  });

  it('resolves deterministically regardless of input order', () => {
    const first = selectRule([lowPriority, moreSpecific, highPriority], transaction);
    const second = selectRule([highPriority, moreSpecific, lowPriority], transaction);
    expect(first?.id).toBe(second?.id);
  });

  it('returns null when nothing matches', () => {
    expect(selectRule([{ ...baseRule, matchMerchant: 'coffee' }], transaction)).toBeNull();
  });

  it('counts how many transactions a rule would affect', () => {
    const rule = { ...baseRule, matchMerchant: 'shell' };
    const transactions = [
      transaction,
      { ...transaction, descriptionRaw: 'SHELL', merchantKey: 'shell' },
      { ...transaction, descriptionRaw: 'COFFEE', merchantKey: 'coffee' },
    ];
    expect(countAffected(rule, transactions)).toBe(2);
  });
});
