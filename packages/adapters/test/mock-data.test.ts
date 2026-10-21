import { describe, expect, it } from 'vitest';

import { merchantKey, normalizeMerchant } from '@moneytracker/core';

import { generateMockData } from '../src/mock/generator.ts';

const dataset = generateMockData();
const all = [...dataset.transactions.values()].flat();

function byDescription(fragment: string) {
  return all.filter((transaction) => transaction.descriptionRaw.includes(fragment));
}

describe('mock data', () => {
  it('covers more than twelve months of history', () => {
    const months = new Set(
      all
        .filter((transaction) => transaction.postedAt)
        .map((transaction) => transaction.postedAt?.toISOString().slice(0, 7)),
    );
    expect(months.size).toBeGreaterThanOrEqual(13);
  });

  it('covers three accounts', () => {
    expect(dataset.accounts).toHaveLength(3);
    expect(dataset.accounts.map((account) => account.type)).toEqual([
      'checking',
      'savings',
      'credit_card',
    ]);
  });

  it('includes transfers between own accounts', () => {
    const transfers = byDescription('TRANSFER');
    expect(transfers.length).toBeGreaterThan(0);
    expect(transfers.every((transaction) => transaction.sourceCategory === 'TRANSFER')).toBe(true);
  });

  it('includes credit card payments', () => {
    const payments = all.filter((transaction) => transaction.sourceCategory === 'CARD PAYMENT');
    expect(payments.length).toBeGreaterThan(0);
    // Money leaves checking and arrives on the card.
    expect(payments.some((payment) => payment.amountMinor < 0)).toBe(true);
    expect(payments.some((payment) => payment.amountMinor > 0)).toBe(true);
  });

  it('includes a refund that is positive', () => {
    const refunds = all.filter(
      (transaction) =>
        transaction.amountMinor > 0 &&
        transaction.sourceCategory !== 'TRANSFER' &&
        transaction.sourceCategory !== 'CARD PAYMENT' &&
        transaction.sourceCategory !== 'PAYROLL' &&
        transaction.sourceCategory !== 'INTEREST',
    );
    expect(refunds.length).toBeGreaterThan(0);
    expect(refunds.some((refund) => refund.descriptionRaw.includes('REFUND'))).toBe(true);
  });

  it('includes pending transactions with no posted date', () => {
    const pending = all.filter((transaction) => transaction.pending);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((transaction) => transaction.postedAt === null)).toBe(true);
  });

  it('includes duplicate-looking charges that stay separate rows', () => {
    const coffee = all.filter(
      (transaction) =>
        transaction.descriptionRaw === 'SQ *BLUE BOTTLE COFFEE #12' &&
        transaction.amountMinor === -525,
    );
    expect(coffee.length).toBeGreaterThanOrEqual(2);
    // Same amount, same day, but different ids: they are not duplicates.
    expect(new Set(coffee.map((transaction) => transaction.externalId)).size).toBe(coffee.length);
  });

  it('includes recurring subscriptions with a price increase', () => {
    const netflix = all.filter((transaction) => transaction.descriptionRaw.includes('NETFLIX'));
    const amounts = new Set(netflix.map((transaction) => Math.abs(transaction.amountMinor)));
    expect(amounts.has(1549)).toBe(true);
    expect(amounts.has(1799)).toBe(true);
  });

  it('includes exactly one annual charge per year', () => {
    const annual = byDescription('ANNUAL INSURANCE PREMIUM');
    expect(annual).toHaveLength(2);
    expect(
      new Set(
        annual
          .map((transaction) => transaction.postedAt?.toISOString().slice(0, 7))
          .map((month) => month?.slice(0, 4)),
      ),
    ).toEqual(new Set(['2025', '2026']));
  });

  it('includes charges the bank cannot categorize', () => {
    const unknown = all.filter((transaction) => transaction.sourceCategory === undefined);
    expect(unknown.length).toBeGreaterThan(0);
  });

  it('uses messy merchant names that normalize to clean ones', () => {
    const coffee = all.find((transaction) => transaction.descriptionRaw.includes('BLUE BOTTLE'));
    expect(coffee).toBeDefined();
    expect(normalizeMerchant(coffee!.descriptionRaw)).toBe('Blue Bottle Coffee');
    expect(merchantKey(normalizeMerchant(coffee!.descriptionRaw))).toBe('blue bottle coffee');
  });

  it('is reproducible with the same seed', () => {
    const again = generateMockData();
    expect(again.transactions.get('mock-checking')).toEqual(
      dataset.transactions.get('mock-checking'),
    );
  });

  it('produces balance snapshots for every account and month', () => {
    const months = new Set(
      dataset.balances.map((balance) => balance.asOf.toISOString().slice(0, 7)),
    );
    expect(months.size).toBeGreaterThanOrEqual(13);
    expect(dataset.balances.every((balance) => Number.isSafeInteger(balance.balanceMinor))).toBe(
      true,
    );
  });

  it('keeps the credit card balance negative', () => {
    const cardBalances = dataset.balances.filter(
      (balance) => balance.accountExternalId === 'mock-card',
    );
    expect(cardBalances.length).toBeGreaterThan(0);
    expect(cardBalances.every((balance) => balance.balanceMinor < 0)).toBe(true);
  });
});
