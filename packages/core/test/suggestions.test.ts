import { describe, expect, it } from 'vitest';

import {
  BANK_CONFIDENCE_CAP,
  categorize,
  categorizeWithAi,
  KEYWORD_CONFIDENCE,
  needsReview,
} from '../src/categorization.ts';
import { KEYWORD_GROUPS, suggestFromKeywords } from '../src/suggestions.ts';
import type { CategorizationContext, NormalizedTransaction, Rule } from '../src/types.ts';

function tx(descriptionRaw: string, overrides: Partial<NormalizedTransaction> = {}) {
  return {
    externalId: 'ext-1',
    accountId: 'checking-1',
    postedAt: new Date('2026-11-01T12:00:00Z'),
    pending: false,
    amountMinor: -2750,
    currency: 'USD',
    descriptionRaw,
    ...overrides,
  } satisfies NormalizedTransaction;
}

const categoryIdBySlug = new Map([
  ['transit', 'cat-transit'],
  ['restaurants', 'cat-restaurants'],
  ['coffee', 'cat-coffee'],
  ['groceries', 'cat-groceries'],
  ['gas', 'cat-gas'],
]);

const ctx: CategorizationContext = {
  categoryIdBySlug,
  categoryNames: new Map([
    ['cat-transit', 'Transit'],
    ['cat-restaurants', 'Restaurants'],
  ]),
  uncategorizedCategoryId: 'cat-uncategorized',
};

describe('suggestFromKeywords', () => {
  it.each([
    ['UBER *TRIP HELP.UBER.COM CA', 'transit', 'UBER'],
    ['UBER   *TRIP', 'transit', 'UBER'],
    ['LYFT *RIDE SUN 8PM', 'transit', 'LYFT'],
    ['MTA*NYCT PAYGO NEW YORK NY', 'transit', 'NYCT'],
    ['MTA MVM*METROCARD', 'transit', 'METROCARD'],
    ['OMNY TAP 10/12', 'transit', 'OMNY'],
    ['CITI BIKE 07/14', 'transit', 'CITI BIKE'],
    ['JOES DELI BROOKLYN NY', 'restaurants', 'DELI'],
    ['SAMS DELI & GROCERY CORP', 'restaurants', 'DELI & GROCERY'],
    ['NY BODEGA 2', 'restaurants', 'BODEGA'],
    ['UBER EATS PENDING', 'restaurants', 'UBER EATS'],
    ['DD DOORDASH SWEETGREEN', 'restaurants', 'SWEETGREEN'],
    ['STARBUCKS STORE 01234', 'coffee', 'STARBUCKS'],
    ['TRADER JOE S #552', 'groceries', 'TRADER JOE'],
    ['SHELL OIL 57444', 'gas', 'SHELL'],
  ])('suggests %s → %s', (description, slug, keyword) => {
    expect(suggestFromKeywords(description)).toEqual({ categorySlug: slug, keyword });
  });

  it('matches whole words only', () => {
    // "MTA" is inside MONTANA, "PATH" inside PATHMARK, "CTA" inside "OCTAVIA".
    expect(suggestFromKeywords('MONTANA OUTFITTERS')).toBeNull();
    expect(suggestFromKeywords('PATHMARK INC')).toBeNull();
    expect(suggestFromKeywords('OCTAVIA LLC')).toBeNull();
    expect(suggestFromKeywords('DELIVERANCE BOOKS')).toBeNull();
  });

  it('ignores case and extra spaces', () => {
    expect(suggestFromKeywords('  joes   deli  ')?.categorySlug).toBe('restaurants');
  });

  it('also looks at the normalized merchant name', () => {
    expect(suggestFromKeywords('POS 4471 08/12', 'Uber')?.categorySlug).toBe('transit');
  });

  it('returns null when nothing matches', () => {
    expect(suggestFromKeywords('ACME HOLDINGS LLC')).toBeNull();
    expect(suggestFromKeywords('')).toBeNull();
  });

  it('prefers the longest keyword, whatever the table order', () => {
    const groups = [
      { categorySlug: 'transit', keywords: ['UBER'] },
      { categorySlug: 'restaurants', keywords: ['UBER EATS'] },
    ];
    expect(suggestFromKeywords('UBER EATS 123', null, groups)?.categorySlug).toBe('restaurants');
  });

  it('keeps every keyword uppercase and unique within the table', () => {
    const seen = new Set<string>();
    for (const group of KEYWORD_GROUPS) {
      for (const keyword of group.keywords) {
        expect(keyword).toBe(keyword.toUpperCase());
        expect(seen.has(keyword), `duplicate keyword ${keyword}`).toBe(false);
        seen.add(keyword);
      }
    }
  });
});

describe('keyword step of the pipeline', () => {
  it('suggests a category with an explanation, below the review threshold', () => {
    const outcome = categorize(tx('UBER *TRIP'), ctx);

    expect(outcome).toEqual({
      categoryId: 'cat-transit',
      source: 'keyword',
      confidence: KEYWORD_CONFIDENCE,
      reason: 'Suggested Transit: the description mentions "UBER"',
    });
    // A guess is never confirmed silently.
    expect(needsReview(outcome)).toBe(true);
  });

  it('ranks below the bank category', () => {
    expect(KEYWORD_CONFIDENCE).toBeLessThan(BANK_CONFIDENCE_CAP);

    const outcome = categorize(tx('JOES DELI', { sourceCategory: 'GROCERY' }), {
      ...ctx,
      bankCategoryMap: new Map([['GROCERY', 'cat-groceries']]),
    });
    expect(outcome.source).toBe('bank');
    expect(outcome.categoryId).toBe('cat-groceries');
  });

  it('never beats a user rule', () => {
    const rule: Rule = {
      id: 'rule-uber',
      name: 'Uber → Work travel',
      priority: 1,
      enabled: true,
      matchMerchant: 'uber',
      matchDescriptionPattern: null,
      minAmountMinor: null,
      maxAmountMinor: null,
      accountId: null,
      categoryId: 'cat-work',
    };
    const outcome = categorize(tx('UBER *TRIP', { merchantRaw: 'Uber' }), {
      ...ctx,
      rules: [rule],
    });
    expect(outcome.source).toBe('user_rule');
    expect(outcome.categoryId).toBe('cat-work');
  });

  it('never beats merchant memory', () => {
    const outcome = categorize(tx('UBER *TRIP', { merchantRaw: 'Uber' }), {
      ...ctx,
      merchantMemory: new Map([['uber', { categoryId: 'cat-rideshare', displayName: 'Rides' }]]),
    });
    expect(outcome.source).toBe('merchant_memory');
    expect(outcome.categoryId).toBe('cat-rideshare');
  });

  it('never turns a transfer into spending', () => {
    const outcome = categorize(tx('TRANSFER TO UBER SAVINGS', { transferState: 'confirmed' }), {
      ...ctx,
      transferCategoryId: 'cat-transfer',
    });
    expect(outcome.source).toBe('transfer_detection');
  });

  it('falls back when the suggested category does not exist for this user', () => {
    const outcome = categorize(tx('NETFLIX.COM'), ctx); // no "subscriptions" slug in ctx
    expect(outcome.source).toBe('fallback');
  });

  it('is off without a slug map', () => {
    const outcome = categorize(tx('UBER *TRIP'), { uncategorizedCategoryId: 'cat-uncategorized' });
    expect(outcome.source).toBe('fallback');
  });

  it('is deterministic', () => {
    const first = categorize(tx('MTA*NYCT PAYGO'), ctx);
    const second = categorize(tx('MTA*NYCT PAYGO'), ctx);
    expect(second).toEqual(first);
  });

  it('is preferred over an AI guess', async () => {
    let asked = false;
    const outcome = await categorizeWithAi(tx('JOES DELI'), {
      ...ctx,
      aiCategorizer: {
        suggest: () => {
          asked = true;
          return Promise.resolve({ categoryId: 'cat-gas', confidence: 0.6, reason: 'guess' });
        },
      },
    });
    expect(outcome.source).toBe('keyword');
    expect(asked).toBe(false);
  });
});
