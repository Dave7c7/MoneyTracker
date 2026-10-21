import { describe, expect, it } from 'vitest';

import {
  cashFlowByMonth,
  groupSmallCategories,
  monthOverMonth,
  spendingByCategory,
  spendingInMonth,
  topMerchants,
  type DashboardTransaction,
} from '../src/dashboards.ts';

const TIME_ZONE = 'UTC';

function transaction(overrides: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: 'tx-1',
    accountId: 'checking-1',
    postedAt: new Date('2026-01-06T12:00:00Z'),
    amountMinor: -1000,
    currency: 'USD',
    pending: false,
    merchantId: 'm-1',
    merchantName: 'Merchant One',
    categoryId: 'cat-groceries',
    categoryName: 'Groceries',
    categoryKind: 'spending',
    ...overrides,
  };
}

/**
 * A hand-checked fixture. Every number below is derived by hand so the
 * dashboard totals are provable, not merely plausible.
 *
 * January 2026
 *   salary        +500000  (income)
 *   groceries     -125000  (spending)
 *   coffee         -4500   (spending)
 *   transfer      -50000   (transfer, excluded everywhere)
 *   groceries     + 25000  (refund, reduces groceries spending)
 *   rent         -1500000  (spending)
 * February 2026
 *   groceries      -75000  (spending)
 *   groceries      -20000  (pending, excluded everywhere)
 *   coffee          -5000  (spending)
 */
const fixture: DashboardTransaction[] = [
  transaction({
    id: 't-salary',
    postedAt: new Date('2026-01-05T12:00:00Z'),
    amountMinor: 500000,
    categoryId: 'cat-salary',
    categoryName: 'Salary',
    categoryKind: 'income',
    merchantId: null,
    merchantName: null,
  }),
  transaction({
    id: 't-groceries-jan',
    postedAt: new Date('2026-01-06T12:00:00Z'),
    amountMinor: -125000,
    merchantId: 'm-grocery',
    merchantName: 'Market Street Grocery',
  }),
  transaction({
    id: 't-coffee-jan',
    postedAt: new Date('2026-01-07T12:00:00Z'),
    amountMinor: -4500,
    categoryId: 'cat-coffee',
    categoryName: 'Coffee',
    merchantId: 'm-coffee',
    merchantName: 'Blue Bottle Coffee',
  }),
  transaction({
    id: 't-transfer',
    postedAt: new Date('2026-01-08T12:00:00Z'),
    amountMinor: -50000,
    categoryId: 'cat-transfer',
    categoryName: 'Transfer',
    categoryKind: 'transfer',
    merchantId: null,
    merchantName: null,
  }),
  transaction({
    id: 't-refund',
    postedAt: new Date('2026-01-10T12:00:00Z'),
    amountMinor: 25000,
    merchantId: 'm-grocery',
    merchantName: 'Market Street Grocery',
  }),
  transaction({
    id: 't-rent',
    postedAt: new Date('2026-01-15T12:00:00Z'),
    amountMinor: -1500000,
    categoryId: 'cat-rent',
    categoryName: 'Rent',
    merchantId: 'm-landlord',
    merchantName: 'Property Manager',
  }),
  transaction({
    id: 't-groceries-feb',
    postedAt: new Date('2026-02-03T12:00:00Z'),
    amountMinor: -75000,
    merchantId: 'm-grocery',
    merchantName: 'Market Street Grocery',
  }),
  transaction({
    id: 't-pending',
    postedAt: null,
    pending: true,
    amountMinor: -20000,
    merchantId: 'm-grocery',
    merchantName: 'Market Street Grocery',
  }),
  transaction({
    id: 't-coffee-feb',
    postedAt: new Date('2026-02-05T12:00:00Z'),
    amountMinor: -5000,
    categoryId: 'cat-coffee',
    categoryName: 'Coffee',
    merchantId: 'm-coffee',
    merchantName: 'Blue Bottle Coffee',
  }),
];

const MONTHS = ['2026-01', '2026-02'];

describe('spendingByCategory', () => {
  it('returns exact per-category monthly totals', () => {
    const result = spendingByCategory(fixture, { timeZone: TIME_ZONE, months: MONTHS });

    expect(result.months).toEqual(MONTHS);

    const groceries = result.categories.find((entry) => entry.categoryId === 'cat-groceries');
    // 125000 spent minus a 25000 refund, then 75000 in February.
    expect(groceries?.monthly).toEqual([100000, 75000]);

    const rent = result.categories.find((entry) => entry.categoryId === 'cat-rent');
    expect(rent?.monthly).toEqual([1500000, 0]);

    const coffee = result.categories.find((entry) => entry.categoryId === 'cat-coffee');
    expect(coffee?.monthly).toEqual([4500, 5000]);
  });

  it('excludes transfers and pending transactions', () => {
    const result = spendingByCategory(fixture, { timeZone: TIME_ZONE, months: MONTHS });
    const names = result.categories.map((entry) => entry.categoryName);
    expect(names).not.toContain('Transfer');
    expect(
      result.categories.find((entry) => entry.categoryId === 'cat-groceries')?.monthly[1],
    ).toBe(75000);
  });

  it('sorts categories by total spending', () => {
    const result = spendingByCategory(fixture, { timeZone: TIME_ZONE, months: MONTHS });
    expect(result.categories[0]?.categoryId).toBe('cat-rent');
  });
});

describe('cashFlowByMonth', () => {
  it('separates income from expenses and excludes transfers', () => {
    const result = cashFlowByMonth(fixture, { timeZone: TIME_ZONE, months: MONTHS });

    expect(result[0]).toEqual({
      month: '2026-01',
      incomeMinor: 500000,
      expenseMinor: 125000 + 4500 - 25000 + 1500000,
      netMinor: 500000 - (125000 + 4500 - 25000 + 1500000),
    });

    expect(result[1]).toEqual({
      month: '2026-02',
      incomeMinor: 0,
      expenseMinor: 75000 + 5000,
      netMinor: -(75000 + 5000),
    });
  });
});

describe('monthOverMonth', () => {
  it('compares a month with the month before it', () => {
    const result = monthOverMonth(fixture, { month: '2026-02', timeZone: TIME_ZONE });

    expect(result.currentMinor).toBe(80000);
    expect(result.previousMinor).toBe(1604500);
    expect(result.deltaMinor).toBe(-1524500);
    expect(result.deltaPercent).toBeCloseTo(-95.014, 3);
    expect(result.previousMonth).toBe('2026-01');
  });
});

describe('spendingInMonth', () => {
  it('totals spending for one month', () => {
    expect(spendingInMonth(fixture, '2026-01', TIME_ZONE)).toBe(1604500);
    expect(spendingInMonth(fixture, '2026-02', TIME_ZONE)).toBe(80000);
  });
});

describe('topMerchants', () => {
  it('ranks merchants by money spent', () => {
    const result = topMerchants(fixture, { timeZone: TIME_ZONE, months: MONTHS });

    expect(result[0]?.merchantName).toBe('Property Manager');
    expect(result[0]?.totalMinor).toBe(1500000);
    expect(result[1]?.merchantName).toBe('Market Street Grocery');
    // 125000 spent, 25000 refunded, 75000 spent in February.
    expect(result[1]?.totalMinor).toBe(175000);
    // Two purchases and one refund.
    expect(result[1]?.transactionCount).toBe(3);
  });

  it('honours the limit', () => {
    expect(topMerchants(fixture, { timeZone: TIME_ZONE, limit: 2 })).toHaveLength(2);
  });
});

describe('groupSmallCategories', () => {
  it('groups the tail into Other', () => {
    const result = spendingByCategory(fixture, { timeZone: TIME_ZONE, months: MONTHS });
    const grouped = groupSmallCategories(result.categories, { topN: 1 });

    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.categoryName).toBe('Rent');
    expect(grouped[1]?.categoryName).toBe('Other');
    // Groceries plus coffee.
    expect(grouped[1]?.monthly).toEqual([104500, 80000]);
  });
});
