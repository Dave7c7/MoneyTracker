import { describe, expect, it } from 'vitest';

import { budgetStatus, spendingInCategory, type BudgetTransaction } from '../src/budgets.ts';
import { goalProgress, type SavingsGoal } from '../src/goals.ts';
import { netWorthSeries } from '../src/dashboards.ts';

function transaction(overrides: Partial<BudgetTransaction> = {}): BudgetTransaction {
  return {
    postedAt: new Date('2026-01-15T12:00:00Z'),
    amountMinor: -10_000,
    categoryId: 'cat-groceries',
    categoryKind: 'spending',
    pending: false,
    ...overrides,
  };
}

describe('budgets', () => {
  it('counts what was spent in the category', () => {
    const spent = spendingInCategory(
      [
        transaction(),
        transaction({ amountMinor: -5_000, postedAt: new Date('2026-01-20T12:00:00Z') }),
        transaction({ amountMinor: -1_000, postedAt: new Date('2026-02-02T12:00:00Z') }),
      ],
      'cat-groceries',
      '2026-01',
      'UTC',
    );

    expect(spent).toBe(15_000);
  });

  it('does not count transfers, income or pending charges', () => {
    const spent = spendingInCategory(
      [
        transaction({ categoryKind: 'transfer' }),
        transaction({ categoryKind: 'income' }),
        transaction({ pending: true }),
        transaction(),
      ],
      'cat-groceries',
      '2026-01',
      'UTC',
    );

    expect(spent).toBe(10_000);
  });

  it('shows what is left of the limit', () => {
    const [status] = budgetStatus(
      [transaction({ amountMinor: -30_000 })],
      [
        {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          amountMinor: 50_000,
          rollover: false,
        },
      ],
      { month: '2026-01', timeZone: 'UTC' },
    );

    expect(status).toMatchObject({
      spentMinor: 30_000,
      budgetMinor: 50_000,
      carriedMinor: 0,
      remainingMinor: 20_000,
      percentUsed: 60,
      overBudget: false,
    });
  });

  it('says when the limit is passed', () => {
    const [status] = budgetStatus(
      [transaction({ amountMinor: -60_000 })],
      [
        {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          amountMinor: 50_000,
          rollover: false,
        },
      ],
      { month: '2026-01', timeZone: 'UTC' },
    );

    expect(status?.overBudget).toBe(true);
    expect(status?.remainingMinor).toBe(-10_000);
  });

  it('carries what was left over into the month', () => {
    const [status] = budgetStatus(
      [
        transaction({ amountMinor: -20_000, postedAt: new Date('2025-12-10T12:00:00Z') }),
        transaction({ amountMinor: -30_000, postedAt: new Date('2026-01-10T12:00:00Z') }),
      ],
      [
        {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          amountMinor: 50_000,
          rollover: true,
        },
      ],
      { month: '2026-01', timeZone: 'UTC' },
    );

    expect(status?.carriedMinor).toBe(30_000);
    expect(status?.effectiveBudgetMinor).toBe(80_000);
    expect(status?.remainingMinor).toBe(50_000);
  });

  it('does not carry anything over when the budget says no', () => {
    const [status] = budgetStatus(
      [
        transaction({ amountMinor: -20_000, postedAt: new Date('2025-12-10T12:00:00Z') }),
        transaction({ amountMinor: -30_000, postedAt: new Date('2026-01-10T12:00:00Z') }),
      ],
      [
        {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          amountMinor: 50_000,
          rollover: false,
        },
      ],
      { month: '2026-01', timeZone: 'UTC' },
    );

    expect(status?.carriedMinor).toBe(0);
    expect(status?.effectiveBudgetMinor).toBe(50_000);
  });
});

describe('savings goals', () => {
  const goal: SavingsGoal = {
    id: 'goal-1',
    name: 'Emergency fund',
    targetMinor: 100_000,
    savedMinor: 40_000,
    accountId: null,
    deadline: '2027-01-01',
  };

  it('shows how far the goal has come', () => {
    const progress = goalProgress(goal, { today: '2026-10-22' });

    expect(progress).toMatchObject({
      savedMinor: 40_000,
      remainingMinor: 60_000,
      percentComplete: 40,
      reached: false,
    });
  });

  it('reads the progress from a linked account', () => {
    const progress = goalProgress(
      { ...goal, accountId: 'savings-1' },
      { today: '2026-10-22', accountBalanceMinor: 90_000 },
    );

    expect(progress.savedMinor).toBe(90_000);
    expect(progress.percentComplete).toBe(90);
  });

  it('knows when the target is reached', () => {
    const progress = goalProgress({ ...goal, savedMinor: 120_000 }, { today: '2026-10-22' });

    expect(progress.reached).toBe(true);
    expect(progress.percentComplete).toBe(100);
    expect(progress.remainingMinor).toBe(0);
  });

  it('says what has to be saved each month to arrive in time', () => {
    const progress = goalProgress(goal, { today: '2026-10-22' });

    expect(progress.daysLeft).toBe(71);
    expect(progress.neededPerMonthMinor).toBe(20_000);
  });
});

describe('net worth over time', () => {
  it('adds up the assets and the liabilities of every month', () => {
    const points = netWorthSeries(
      [
        { accountId: 'checking', asOf: new Date('2026-01-31T00:00:00Z'), balanceMinor: 100_000 },
        { accountId: 'card', asOf: new Date('2026-01-31T00:00:00Z'), balanceMinor: -20_000 },
        { accountId: 'checking', asOf: new Date('2026-02-28T00:00:00Z'), balanceMinor: 150_000 },
      ],
      {
        months: ['2026-01', '2026-02', '2026-03'],
        isLiability: (accountId) => accountId === 'card',
      },
    );

    expect(points[0]).toMatchObject({
      assetsMinor: 100_000,
      liabilitiesMinor: -20_000,
      netMinor: 80_000,
    });
    expect(points[1]).toMatchObject({ assetsMinor: 150_000, netMinor: 130_000 });
    // No new snapshot: the last known balance is carried forward.
    expect(points[2]).toMatchObject({ assetsMinor: 150_000, netMinor: 130_000 });
  });
});
