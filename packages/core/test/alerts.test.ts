/**
 * The sentences alerts say.
 *
 * These are pure: facts in, an alert or nothing out. The database side is
 * tested where it lives. What matters here is that the rules are strict — one
 * alert per fact, no alert for a transfer or a small charge — and that the
 * words are the ones a person would use.
 */

import { describe, expect, it } from 'vitest';

import {
  BUDGET_ALERT_PERCENT,
  budgetAlert,
  connectionAlert,
  largeTransactionAlert,
  recurringDueAlert,
  recurringPriceAlert,
  webhookRequest,
  webhookText,
} from '../src/alerts.ts';

const budget = {
  budgetId: 'budget-1',
  categoryName: 'Groceries',
  month: '2026-10',
  spentMinor: 45_500,
  effectiveBudgetMinor: 50_000,
  percentUsed: 91,
  overBudget: false,
  currency: 'USD',
};

describe('budgetAlert', () => {
  it('says nothing while a budget is comfortable', () => {
    expect(budgetAlert({ ...budget, spentMinor: 30_000, percentUsed: 60 })).toBeNull();
    expect(budgetAlert({ ...budget, percentUsed: BUDGET_ALERT_PERCENT - 1 })).toBeNull();
  });

  it('speaks up at the threshold, once for the month', () => {
    const alert = budgetAlert(budget);
    expect(alert).not.toBeNull();
    expect(alert?.title).toBe('Groceries is at 91% of its budget');
    expect(alert?.body).toBe('Spent $455.00 of $500.00 this month.');
    expect(alert?.dedupeKey).toBe('budget:budget-1:2026-10:near');
    expect(alert?.href).toBe('/budgets');
  });

  it('raises the same key for the same fact, so a second look adds nothing', () => {
    const first = budgetAlert(budget);
    const second = budgetAlert({ ...budget, spentMinor: 46_000, percentUsed: 92 });
    expect(second?.dedupeKey).toBe(first?.dedupeKey);
  });

  it('turns the alert into the worse one when the limit is passed', () => {
    const alert = budgetAlert({
      ...budget,
      spentMinor: 61_000,
      percentUsed: 122,
      overBudget: true,
    });

    expect(alert?.title).toBe('Groceries is over budget');
    expect(alert?.body).toBe('Spent $610.00 of $500.00 this month, $110.00 over.');
    expect(alert?.dedupeKey).toBe('budget:budget-1:2026-10:over');
  });

  it('says the limit was reached when the spending lands exactly on it', () => {
    const alert = budgetAlert({
      ...budget,
      spentMinor: 50_000,
      percentUsed: 100,
      overBudget: false,
    });

    expect(alert?.title).toBe('Groceries has reached its budget');
    expect(alert?.body).toBe(
      'Spent $500.00 of $500.00 this month. There is nothing left in this budget.',
    );
    expect(alert?.dedupeKey).toBe('budget:budget-1:2026-10:over');
  });

  it('says nothing about a budget with no limit', () => {
    expect(budgetAlert({ ...budget, effectiveBudgetMinor: 0, percentUsed: 500 })).toBeNull();
  });
});

describe('connectionAlert', () => {
  it('names the connection, the error and where to look', () => {
    const alert = connectionAlert({
      connectionId: 'conn-1',
      name: 'SoFi checking',
      error: 'The token expired.',
      lastAttemptAt: new Date('2026-10-23T09:00:00.000Z'),
    });

    expect(alert.title).toBe('SoFi checking stopped syncing');
    expect(alert.body).toContain('The token expired.');
    expect(alert.dedupeKey).toBe('sync:conn-1:2026-10-23T09:00:00.000Z');
    expect(alert.href).toBe('/connections');
  });

  it('gives each failed attempt its own key', () => {
    const base = { connectionId: 'conn-1', name: 'SoFi', error: 'No route to host.' };
    const first = connectionAlert({ ...base, lastAttemptAt: new Date('2026-10-23T09:00:00Z') });
    const second = connectionAlert({ ...base, lastAttemptAt: new Date('2026-10-24T09:00:00Z') });
    expect(second.dedupeKey).not.toBe(first.dedupeKey);
  });
});

describe('largeTransactionAlert', () => {
  const charge = {
    transactionId: 'txn-1',
    merchant: 'SoFi',
    amountMinor: -120_000,
    currency: 'USD',
    postedDate: '2026-10-22' as const,
    thresholdMinor: 50_000,
  };

  it('speaks up for a charge at or above the threshold', () => {
    const alert = largeTransactionAlert(charge);
    expect(alert?.title).toBe('SoFi: $1,200.00');
    expect(alert?.body).toBe(
      'A charge of $1,200.00 on 2026-10-22. You asked to hear about charges of $500.00 or more.',
    );
    expect(alert?.dedupeKey).toBe('transaction:txn-1');
  });

  it('speaks up when the charge is exactly the threshold', () => {
    expect(largeTransactionAlert({ ...charge, amountMinor: -50_000 })).not.toBeNull();
  });

  it('says nothing about a smaller charge', () => {
    expect(largeTransactionAlert({ ...charge, amountMinor: -49_999 })).toBeNull();
  });

  it('says nothing about money coming in', () => {
    expect(largeTransactionAlert({ ...charge, amountMinor: 120_000 })).toBeNull();
  });

  it('says nothing without a threshold', () => {
    expect(largeTransactionAlert({ ...charge, thresholdMinor: 0 })).toBeNull();
  });

  it('leaves the date out when there is none', () => {
    const alert = largeTransactionAlert({ ...charge, postedDate: null });
    expect(alert?.body).toContain('A charge of $1,200.00.');
    expect(alert?.body).not.toContain(' on ');
  });
});

describe('recurringPriceAlert', () => {
  it('says what it was, what it is, and how often it comes', () => {
    const alert = recurringPriceAlert({
      itemId: 'sub-1',
      name: 'Netflix',
      previousAmountMinor: 1_549,
      amountMinor: 1_999,
      cadence: 'monthly',
      currency: 'USD',
    });

    expect(alert.title).toBe('Netflix changed price');
    expect(alert.body).toBe('It went from $15.49 to $19.99 a month.');
    expect(alert.dedupeKey).toBe('recurring:sub-1:price:1999');
  });

  it('gives a second change its own key', () => {
    const base = {
      itemId: 'sub-1',
      name: 'Netflix',
      previousAmountMinor: 1_999,
      cadence: 'monthly' as const,
      currency: 'USD',
    };
    expect(recurringPriceAlert({ ...base, amountMinor: 2_499 }).dedupeKey).toBe(
      'recurring:sub-1:price:2499',
    );
  });
});

describe('recurringDueAlert', () => {
  const due = {
    itemId: 'sub-1',
    name: 'Netflix',
    amountMinor: 1_999,
    cadence: 'monthly' as const,
    dueDate: '2026-10-26' as const,
    daysUntil: 3,
    currency: 'USD',
  };

  it('counts the days and keeps one key per due date', () => {
    const alert = recurringDueAlert(due);
    expect(alert.title).toBe('Netflix is due in 3 days');
    expect(alert.body).toBe('$19.99 is expected on 2026-10-26.');
    expect(alert.dedupeKey).toBe('recurring:sub-1:due:2026-10-26');
  });

  it('says today and tomorrow rather than counting to one', () => {
    expect(recurringDueAlert({ ...due, daysUntil: 0 }).title).toBe('Netflix is due today');
    expect(recurringDueAlert({ ...due, daysUntil: 1 }).title).toBe('Netflix is due tomorrow');
  });

  it('says overdue when the date has passed', () => {
    const alert = recurringDueAlert({ ...due, daysUntil: -2 });
    expect(alert.title).toBe('Netflix is overdue');
    expect(alert.body).toBe('$19.99 was expected on 2026-10-26.');
  });
});

describe('the webhook message', () => {
  it('says what happened, and nothing that names or prices it', () => {
    expect(webhookText({ kind: 'budget', href: '/budgets' }, 'https://money.example.com/')).toBe(
      'A budget needs attention\nhttps://money.example.com/budgets',
    );
    expect(webhookText({ kind: 'sync', href: '/connections' })).toBe(
      'A bank connection stopped syncing\n/connections',
    );
    expect(webhookText({ kind: 'large-transaction', href: '/transactions' })).toBe(
      'A large transaction was posted\n/transactions',
    );
    expect(webhookText({ kind: 'recurring', href: '/subscriptions' })).toBe(
      'A recurring charge needs attention\n/subscriptions',
    );
  });

  it('has a sentence for a kind this version does not know', () => {
    expect(webhookText({ kind: 'future', href: null })).toBe(
      'There is something new in MoneyTracker',
    );
  });

  it('keeps the detail in the inbox, even when the alert carries it', () => {
    const detailed = {
      kind: 'large-transaction',
      title: 'Acme Store: $1,200.00',
      body: 'A charge of $1,200.00 on 2026-10-20.',
      href: '/transactions',
    };

    const request = webhookRequest(detailed, 'https://money.example.com');
    expect(request.headers.Title).toBe('A large transaction was posted');
    expect(request.body).toBe(
      'A large transaction was posted\nhttps://money.example.com/transactions',
    );
    expect(request.body).not.toContain('Acme');
    expect(request.body).not.toContain('$');
  });

  it('carries the headers ntfy reads, and a content type everything reads', () => {
    const request = webhookRequest(
      { kind: 'budget', href: '/budgets' },
      'https://money.example.com',
    );
    expect(request.headers['Content-Type']).toBe('text/plain; charset=utf-8');
    expect(request.headers.Title).toBe('A budget needs attention');
    expect(request.headers.Tags).toBe('money');
    expect(request.headers.Click).toBe('https://money.example.com/budgets');
  });

  it('has no click target when the alert has nowhere to go', () => {
    const request = webhookRequest({ kind: 'budget', href: null }, 'https://money.example.com');
    expect(request.headers.Click).toBeUndefined();
    expect(request.body).not.toContain('https://money.example.com');
  });
});
