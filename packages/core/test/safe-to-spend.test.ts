import { describe, expect, it } from 'vitest';

import type { DashboardTransaction } from '../src/dashboards.ts';
import {
  safeToSpend,
  type SafeToSpendBillInput,
  type SafeToSpendGoalInput,
} from '../src/safe-to-spend.ts';

const TZ = 'UTC';
let next = 0;

/** A posted transaction on a day, in minor units (negative = money out). */
function tx(
  day: string,
  amountMinor: number,
  kind: DashboardTransaction['categoryKind'] = 'spending',
  overrides: Partial<DashboardTransaction> = {},
): DashboardTransaction {
  next += 1;
  return {
    id: `t${next}`,
    accountId: 'a1',
    postedAt: new Date(`${day}T12:00:00Z`),
    amountMinor,
    currency: 'USD',
    pending: false,
    merchantId: null,
    merchantName: null,
    categoryId: kind,
    categoryName: kind,
    categoryKind: kind,
    ...overrides,
  };
}

/** Three months of $4,000 pay, then November so far. */
const HISTORY = [
  tx('2026-08-01', 400_000, 'income'),
  tx('2026-09-01', 400_000, 'income'),
  tx('2026-10-01', 400_000, 'income'),
];

function bill(overrides: Partial<SafeToSpendBillInput> = {}): SafeToSpendBillInput {
  return {
    merchantName: 'Netflix',
    amountMinor: 1_599,
    nextDate: '2026-11-20',
    status: 'confirmed',
    ...overrides,
  };
}

function run(
  transactions: DashboardTransaction[],
  options: {
    recurring?: SafeToSpendBillInput[];
    goals?: SafeToSpendGoalInput[];
    today?: string;
  } = {},
) {
  return safeToSpend({
    transactions,
    recurring: options.recurring ?? [],
    goals: options.goals ?? [],
    today: options.today ?? '2026-11-11',
    timeZone: TZ,
  });
}

describe('safeToSpend', () => {
  it('takes spending, bills and savings off the expected income', () => {
    const result = run([...HISTORY, tx('2026-11-03', -100_000)], {
      recurring: [bill({ amountMinor: 150_000, merchantName: 'Rent', nextDate: '2026-11-15' })],
      goals: [{ name: 'Trip', reached: false, neededPerMonthMinor: 20_000 }],
    });

    expect(result.incomeMinor).toBe(400_000);
    expect(result.incomeBasis).toBe('average');
    expect(result.spentMinor).toBe(100_000);
    expect(result.billsMinor).toBe(150_000);
    expect(result.savingsMinor).toBe(20_000);
    expect(result.safeMinor).toBe(130_000);
    // 20 days left counting today (Nov 11 to Nov 30).
    expect(result.daysLeft).toBe(20);
    expect(result.perDayMinor).toBe(6_500);
    expect(result.overspent).toBe(false);
  });

  it('uses this month’s income when it is already above the average', () => {
    const result = run([...HISTORY, tx('2026-11-01', 450_000, 'income')]);
    expect(result.incomeBasis).toBe('this-month');
    expect(result.incomeMinor).toBe(450_000);
  });

  it('averages only the past months that had income', () => {
    const result = run([tx('2026-10-01', 300_000, 'income')]);
    expect(result.averageMonths).toBe(1);
    expect(result.averageIncomeMinor).toBe(300_000);
  });

  it('counts only bills still to come this month', () => {
    const result = run(HISTORY, {
      today: '2026-11-11',
      recurring: [
        bill({ merchantName: 'Paid already', nextDate: '2026-11-05' }),
        bill({ merchantName: 'Due today', nextDate: '2026-11-11', amountMinor: 1_000 }),
        bill({ merchantName: 'Later', nextDate: '2026-11-30', amountMinor: 2_000 }),
        bill({ merchantName: 'Next month', nextDate: '2026-12-01' }),
        bill({ merchantName: 'Dismissed', nextDate: '2026-11-20', status: 'dismissed' }),
      ],
    });

    expect(result.bills.map((entry) => entry.name)).toEqual(['Due today', 'Later']);
    expect(result.billsMinor).toBe(3_000);
  });

  it('sets aside only goals that need money this month', () => {
    const result = run(HISTORY, {
      goals: [
        { name: 'Trip', reached: false, neededPerMonthMinor: 10_000 },
        { name: 'No deadline', reached: false, neededPerMonthMinor: null },
        { name: 'Done', reached: true, neededPerMonthMinor: 5_000 },
      ],
    });
    expect(result.savings).toEqual([{ name: 'Trip', amountMinor: 10_000 }]);
  });

  it('counts pending charges as money already gone', () => {
    const result = run([
      ...HISTORY,
      tx('2026-11-10', -2_500, 'spending', { pending: true, postedAt: null }),
    ]);
    expect(result.pendingMinor).toBe(2_500);
    expect(result.safeMinor).toBe(400_000 - 2_500);
  });

  it('leaves transfers and card payments out', () => {
    const result = run([...HISTORY, tx('2026-11-04', -90_000, 'transfer')]);
    expect(result.spentMinor).toBe(0);
    expect(result.safeMinor).toBe(400_000);
  });

  it('counts a refund back', () => {
    const result = run([...HISTORY, tx('2026-11-02', -10_000), tx('2026-11-06', 4_000)]);
    expect(result.spentMinor).toBe(6_000);
  });

  it('says when the month is already over budget', () => {
    const result = run([...HISTORY, tx('2026-11-05', -450_000)]);
    expect(result.safeMinor).toBe(-50_000);
    expect(result.overspent).toBe(true);
    expect(result.perDayMinor).toBe(0);
  });

  it('gives the whole amount on the last day of the month', () => {
    const result = run(HISTORY, { today: '2026-11-30' });
    expect(result.daysLeft).toBe(1);
    expect(result.perDayMinor).toBe(result.safeMinor);
  });

  it('handles February', () => {
    expect(run([], { today: '2027-02-01' }).daysLeft).toBe(28);
    expect(run([], { today: '2028-02-01' }).daysLeft).toBe(29);
  });

  it('says when there is no income to go on', () => {
    const result = run([tx('2026-11-02', -5_000)]);
    expect(result.incomeBasis).toBe('none');
    expect(result.incomeMinor).toBe(0);
  });
});
