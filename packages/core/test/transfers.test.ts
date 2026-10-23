import { describe, expect, it } from 'vitest';

import {
  categorize,
  REVIEW_CONFIDENCE_THRESHOLD,
  SUSPECTED_TRANSFER_CONFIDENCE,
  TRANSFER_CONFIDENCE,
} from '../src/categorization.ts';
import { detectTransfers, looksLikePayment, type TransferCandidate } from '../src/transfers.ts';
import type { NormalizedTransaction } from '../src/types.ts';

function candidate(overrides: Partial<TransferCandidate> = {}): TransferCandidate {
  return {
    id: 'tx-1',
    accountId: 'checking-1',
    accountType: 'checking',
    postedAt: new Date('2026-01-16T12:00:00Z'),
    amountMinor: -80_000,
    descriptionRaw: 'ONLINE TRANSFER TO SAVINGS 8820',
    ...overrides,
  };
}

describe('transfer detection', () => {
  it('pairs an outgoing transfer with the incoming one a day later', () => {
    const { pairs } = detectTransfers([
      candidate(),
      candidate({
        id: 'tx-2',
        accountId: 'savings-1',
        accountType: 'savings',
        postedAt: new Date('2026-01-17T12:00:00Z'),
        amountMinor: 80_000,
        descriptionRaw: 'ONLINE TRANSFER FROM CHECKING 4417',
      }),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      debitId: 'tx-1',
      creditId: 'tx-2',
      amountMinor: 80_000,
      kind: 'internal',
      daysApart: 1,
    });
  });
  it('calls a card payment a card payment', () => {
    const { pairs } = detectTransfers([
      candidate({
        descriptionRaw: 'ONLINE PAYMENT TO CREDIT CARD 5510',
        postedAt: new Date('2026-02-20T12:00:00Z'),
      }),
      candidate({
        id: 'tx-2',
        accountId: 'card-1',
        accountType: 'credit_card',
        postedAt: new Date('2026-02-22T12:00:00Z'),
        amountMinor: 80_000,
        descriptionRaw: 'PAYMENT RECEIVED - THANK YOU',
      }),
    ]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.kind).toBe('card_payment');
    expect(pairs[0]!.daysApart).toBe(2);
  });

  it('does not pair amounts that are more than three days apart', () => {
    const { pairs, suspected } = detectTransfers([
      candidate(),
      candidate({
        id: 'tx-2',
        accountId: 'savings-1',
        accountType: 'savings',
        postedAt: new Date('2026-01-22T12:00:00Z'),
        amountMinor: 80_000,
        descriptionRaw: 'ONLINE TRANSFER FROM CHECKING 4417',
      }),
    ]);

    expect(pairs).toHaveLength(0);
    expect(suspected.map((item) => item.transactionId)).toEqual(['tx-1', 'tx-2']);
  });

  it('does not pair different amounts', () => {
    const { pairs } = detectTransfers([
      candidate(),
      candidate({
        id: 'tx-2',
        accountId: 'savings-1',
        accountType: 'savings',
        amountMinor: 79_900,
        descriptionRaw: 'ONLINE TRANSFER FROM CHECKING 4417',
      }),
    ]);

    expect(pairs).toHaveLength(0);
  });

  it('does not pair two transactions on the same account', () => {
    const { pairs } = detectTransfers([
      candidate(),
      candidate({
        id: 'tx-2',
        amountMinor: 80_000,
        descriptionRaw: 'ONLINE TRANSFER FROM CHECKING 4417',
      }),
    ]);

    expect(pairs).toHaveLength(0);
  });

  it('does not pair a refund that happens to match an outgoing payment', () => {
    const { pairs } = detectTransfers([
      candidate({
        descriptionRaw: 'ONLINE PAYMENT TO CREDIT CARD 5510',
        amountMinor: -4_500,
      }),
      candidate({
        id: 'tx-2',
        accountId: 'card-1',
        accountType: 'credit_card',
        amountMinor: 4_500,
        descriptionRaw: 'REFUND ACME MARKET',
      }),
    ]);

    expect(pairs).toHaveLength(0);
  });

  it('does not suspect a refund', () => {
    const { suspected } = detectTransfers([
      candidate({ descriptionRaw: 'AIRBNB * REFUND 4HK2L9', amountMinor: 24_500 }),
    ]);

    expect(suspected).toHaveLength(0);
  });

  it('uses every transaction in at most one pair', () => {
    const { pairs } = detectTransfers([
      candidate({ id: 'out-1', postedAt: new Date('2026-03-01T12:00:00Z') }),
      candidate({
        id: 'in-1',
        accountId: 'savings-1',
        accountType: 'savings',
        amountMinor: 80_000,
        postedAt: new Date('2026-03-02T12:00:00Z'),
        descriptionRaw: 'ONLINE TRANSFER FROM CHECKING 4417',
      }),
      candidate({
        id: 'in-2',
        accountId: 'savings-2',
        accountType: 'savings',
        amountMinor: 80_000,
        postedAt: new Date('2026-03-02T12:00:00Z'),
        descriptionRaw: 'ONLINE TRANSFER FROM CHECKING 4417',
      }),
    ]);

    expect(pairs).toHaveLength(1);
    const used = pairs.flatMap((pair) => [pair.debitId, pair.creditId]);
    expect(new Set(used).size).toBe(used.length);
  });

  it('reports a payment without a partner as suspected', () => {
    const { pairs, suspected } = detectTransfers([
      candidate({ descriptionRaw: 'ONLINE TRANSFER TO SAVINGS 8820' }),
    ]);

    expect(pairs).toHaveLength(0);
    expect(suspected).toHaveLength(1);
    expect(suspected[0]!.transactionId).toBe('tx-1');
    expect(suspected[0]!.reason).toContain('no matching transaction');
  });

  it('leaves ordinary purchases alone', () => {
    const { pairs, suspected } = detectTransfers([
      candidate({ descriptionRaw: 'SQ *BLUE BOTTLE COFFEE #12', amountMinor: -450 }),
    ]);

    expect(pairs).toHaveLength(0);
    expect(suspected).toHaveLength(0);
  });

  it('ignores pending transactions', () => {
    const { pairs, suspected } = detectTransfers([candidate({ postedAt: null })]);

    expect(pairs).toHaveLength(0);
    expect(suspected).toHaveLength(0);
  });

  it('recognizes the words a bank uses for moving money', () => {
    expect(looksLikePayment('ONLINE TRANSFER TO SAVINGS 8820')).toBe(true);
    expect(looksLikePayment('PAYMENT RECEIVED - THANK YOU')).toBe(true);
    expect(looksLikePayment('ONLINE PAYMENT TO CREDIT CARD 5510')).toBe(true);
    expect(looksLikePayment('SQ *BLUE BOTTLE COFFEE #12')).toBe(false);
  });

  it('does not mistake a bill for a transfer', () => {
    expect(looksLikePayment('PG&E ELECTRIC BILL PAYMENT')).toBe(false);
    expect(looksLikePayment('VENMO PAYMENT 1234 TO JOHN D')).toBe(false);
    expect(looksLikePayment('T-MOBILE AUTOPAY 855-555-0123')).toBe(false);
  });
});

describe('categorizing a transfer', () => {
  function transaction(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
    return {
      externalId: 'ext-1',
      accountId: 'checking-1',
      postedAt: new Date('2026-01-16T12:00:00Z'),
      pending: false,
      amountMinor: -80_000,
      currency: 'USD',
      descriptionRaw: 'ONLINE TRANSFER TO SAVINGS 8820',
      ...overrides,
    };
  }

  const context = {
    uncategorizedCategoryId: 'cat-uncategorized',
    transferCategoryId: 'cat-transfer',
    bankCategoryMap: new Map([['TRANSFER', 'cat-transfer']]),
  };

  it('gives a confirmed transfer the transfer category', () => {
    const outcome = categorize(transaction({ transferState: 'confirmed' }), context);

    expect(outcome.categoryId).toBe('cat-transfer');
    expect(outcome.source).toBe('transfer_detection');
    expect(outcome.confidence).toBe(TRANSFER_CONFIDENCE);
  });

  it('keeps a suspected transfer below the review threshold', () => {
    const outcome = categorize(transaction({ transferState: 'suspected' }), context);

    expect(outcome.categoryId).toBe('cat-transfer');
    expect(outcome.confidence).toBe(SUSPECTED_TRANSFER_CONFIDENCE);
    expect(outcome.confidence).toBeLessThan(REVIEW_CONFIDENCE_THRESHOLD);
  });

  it('lets a user rule beat the detection', () => {
    const outcome = categorize(transaction({ transferState: 'confirmed' }), {
      ...context,
      rules: [
        {
          id: 'rule-1',
          name: 'Savings top-up → Other',
          priority: 10,
          enabled: true,
          matchMerchant: null,
          matchDescriptionPattern: 'TRANSFER TO SAVINGS',
          minAmountMinor: null,
          maxAmountMinor: null,
          accountId: null,
          categoryId: 'cat-other',
        },
      ],
    });

    expect(outcome.categoryId).toBe('cat-other');
    expect(outcome.source).toBe('user_rule');
  });

  it('does nothing special without a transfer category', () => {
    const outcome = categorize(transaction({ transferState: 'confirmed' }), {
      uncategorizedCategoryId: 'cat-uncategorized',
    });

    expect(outcome.source).toBe('fallback');
  });
});
