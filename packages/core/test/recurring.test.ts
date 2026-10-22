import { describe, expect, it } from 'vitest';

import {
  detectRecurring,
  recurringCost,
  recurringTotals,
  upcomingRecurring,
  type RecurringCandidate,
} from '../src/recurring.ts';

function candidate(overrides: Partial<RecurringCandidate> = {}): RecurringCandidate {
  return {
    id: 'tx-1',
    accountId: 'checking-1',
    postedAt: new Date('2026-01-06T12:00:00Z'),
    amountMinor: -1549,
    currency: 'USD',
    descriptionRaw: 'NETFLIX.COM 800-585-0494',
    merchantKey: 'netflix',
    merchantName: 'Netflix',
    categoryId: 'cat-1',
    categoryName: 'Entertainment',
    categoryKind: 'spending',
    pending: false,
    ...overrides,
  };
}

/** A monthly charge on the same day of every month. */
function monthly(
  merchantKey: string,
  months: string[],
  amountMinor = -1549,
  overrides: Partial<RecurringCandidate> = {},
): RecurringCandidate[] {
  return months.map((month, index) =>
    candidate({
      id: `${merchantKey}-${index}`,
      postedAt: new Date(`${month}-06T12:00:00Z`),
      amountMinor,
      merchantKey,
      merchantName: merchantKey,
      ...overrides,
    }),
  );
}

describe('recurring detection', () => {
  it('finds a monthly subscription', () => {
    const items = detectRecurring(monthly('netflix', ['2026-01', '2026-02', '2026-03', '2026-04']));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      merchantKey: 'netflix',
      cadence: 'monthly',
      amountMinor: 1549,
      occurrences: 4,
      firstDate: '2026-01-06',
      lastDate: '2026-04-06',
      nextDate: '2026-05-06',
      priceChanged: false,
    });
  });

  it('ignores a one-off purchase', () => {
    const items = detectRecurring(
      monthly('target', ['2026-01', '2026-02', '2026-04']).map((transaction, index) => ({
        ...transaction,
        id: `target-${index}`,
        postedAt: new Date(`2026-0${index + 1}-14T12:00:00Z`),
        amountMinor: -4000 + index * 1500,
      })),
    );

    expect(items).toEqual([]);
  });

  it('needs three charges before it calls something recurring', () => {
    const items = detectRecurring(monthly('spotify', ['2026-01', '2026-02']));

    expect(items).toEqual([]);
  });

  it('finds a weekly charge', () => {
    const dates = ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'];
    const items = detectRecurring(
      dates.map((date, index) =>
        candidate({
          id: `weekly-${index}`,
          postedAt: new Date(`${date}T12:00:00Z`),
          merchantKey: 'gym',
          merchantName: 'Gym',
        }),
      ),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cadence: 'weekly', nextDate: '2026-02-02' });
  });

  it('finds an annual charge', () => {
    const dates = ['2023-10-15', '2024-10-15', '2025-10-15'];
    const items = detectRecurring(
      dates.map((date, index) =>
        candidate({
          id: `annual-${index}`,
          postedAt: new Date(`${date}T12:00:00Z`),
          amountMinor: -24_900,
          merchantKey: 'insurance',
          merchantName: 'Insurance',
        }),
      ),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ cadence: 'annual', nextDate: '2026-10-15' });
  });

  it('flags a price change but keeps the subscription', () => {
    const amounts = [-1549, -1549, -1549, -1799, -1799, -1799];
    const items = detectRecurring(
      amounts.map((amountMinor, index) =>
        candidate({
          id: `netflix-${index}`,
          postedAt: new Date(`2026-0${index + 1}-06T12:00:00Z`),
          amountMinor,
        }),
      ),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      cadence: 'monthly',
      priceChanged: true,
      previousAmountMinor: 1549,
      amountMinor: 1799,
    });
    expect(items[0]?.reason).toContain('price changed');
  });

  it('does not call a bill that simply varies a price change', () => {
    // A utility bill: the amount is different every month, but it is not a
    // new price.
    const amounts = [-13614, -10270, -10007, -10583, -13148, -9732, -10738];
    const items = detectRecurring(
      amounts.map((amountMinor, index) =>
        candidate({
          id: `bill-${index}`,
          postedAt: new Date(`2026-0${index + 1}-08T12:00:00Z`),
          amountMinor,
          merchantKey: 'utility',
          merchantName: 'Utility',
        }),
      ),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.priceChanged).toBe(false);
    expect(items[0]?.previousAmountMinor).toBeNull();
  });

  it('does not call a merchant with wild amounts a subscription', () => {
    const amounts = [-1000, -5000, -9000, -300, -8000, -2000];
    const items = detectRecurring(
      amounts.map((amountMinor, index) =>
        candidate({
          id: `wild-${index}`,
          postedAt: new Date(`2026-0${index + 1}-06T12:00:00Z`),
          amountMinor,
          merchantKey: 'shop',
          merchantName: 'Shop',
        }),
      ),
    );

    expect(items).toEqual([]);
  });

  it('leaves income and transfers alone', () => {
    const items = detectRecurring(
      monthly('payroll', ['2026-01', '2026-02', '2026-03'], 500_000, {
        categoryKind: 'income',
      }),
    );

    expect(items).toEqual([]);
  });

  it('leaves pending charges alone', () => {
    const items = detectRecurring(
      monthly('netflix', ['2026-01', '2026-02', '2026-03']).map((transaction) => ({
        ...transaction,
        pending: true,
      })),
    );

    expect(items).toEqual([]);
  });

  it('keeps the same merchant on two accounts apart', () => {
    const items = detectRecurring([
      ...monthly('netflix', ['2026-01', '2026-02', '2026-03']),
      ...monthly('netflix', ['2026-01', '2026-02', '2026-03']).map((transaction, index) => ({
        ...transaction,
        id: `card-${index}`,
        accountId: 'card-1',
      })),
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.accountId).sort()).toEqual(['card-1', 'checking-1']);
  });
});

describe('recurring cost', () => {
  it('keeps a monthly charge as it is', () => {
    expect(recurringCost(1549, 'monthly')).toEqual({ monthlyMinor: 1549, annualMinor: 18_588 });
  });

  it('spreads a weekly charge over the year', () => {
    expect(recurringCost(1000, 'weekly')).toEqual({ monthlyMinor: 4333, annualMinor: 52_000 });
  });

  it('divides an annual charge by twelve', () => {
    expect(recurringCost(24_900, 'annual')).toEqual({ monthlyMinor: 2075, annualMinor: 24_900 });
  });

  it('adds the costs of a list', () => {
    const totals = recurringTotals([
      { amountMinor: 1549, cadence: 'monthly' },
      { amountMinor: 24_900, cadence: 'annual' },
    ]);

    expect(totals).toEqual({ monthlyMinor: 1549 + 2075, annualMinor: 18_588 + 24_900 });
  });
});

describe('upcoming recurring', () => {
  const item = (overrides: Partial<Parameters<typeof upcomingRecurring>[0][number]>) =>
    ({ nextDate: '2026-11-03', ...overrides }) as Parameters<typeof upcomingRecurring>[0][number];

  it('lists the charges that land inside the window', () => {
    const upcoming = upcomingRecurring(
      [
        item({ nextDate: '2026-10-25' }),
        item({ nextDate: '2026-11-03' }),
        item({ nextDate: '2026-12-01' }),
      ],
      { from: '2026-10-22', days: 30 },
    );

    expect(upcoming.map((entry) => entry.nextDate)).toEqual(['2026-10-25', '2026-11-03']);
  });
});
