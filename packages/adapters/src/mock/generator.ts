/**
 * Deterministic mock data.
 *
 * The generated data must contain every edge case the app has to survive:
 * transfers, card payments, refunds, pending items, duplicate-looking charges,
 * messy merchant names, recurring subscriptions, a price increase and one
 * annual charge. The generator is seeded, so the same options always produce
 * the same data.
 */

import { createRandom, type Random } from '@moneytracker/core';

import {
  BILLS,
  COFFEE,
  GAS,
  GROCERIES,
  RESTAURANTS,
  SHOPPING,
  SUBSCRIPTIONS,
  UNCATEGORIZED,
  type MerchantTemplate,
} from './catalog.ts';

export type {
  NormalizedAccount,
  NormalizedBalance,
  NormalizedTransaction,
} from '@moneytracker/core';
import type {
  NormalizedAccount,
  NormalizedBalance,
  NormalizedTransaction,
} from '@moneytracker/core';

/** Default seed. Fixed so tests and seeded databases stay reproducible. */
export const DEFAULT_SEED = 20260101;
/** Default anchor: the last day of the generated history. */
export const DEFAULT_ANCHOR = '2026-10-15T12:00:00.000Z';
/** Default number of months of history, including the anchor month. */
export const DEFAULT_MONTHS = 13;

/** Opening balances in minor units, before any transaction. */
const OPENING_BALANCES: Readonly<Record<string, number>> = {
  'mock-checking': 450_000,
  'mock-savings': 1_500_000,
  'mock-card': -25_000,
};

/** The accounts the mock source exposes. */
export const MOCK_ACCOUNTS: readonly NormalizedAccount[] = [
  {
    externalId: 'mock-checking',
    name: 'Everyday Checking',
    type: 'checking',
    currency: 'USD',
    mask: '4417',
  },
  {
    externalId: 'mock-savings',
    name: 'High-Yield Savings',
    type: 'savings',
    currency: 'USD',
    mask: '8820',
  },
  {
    externalId: 'mock-card',
    name: 'Rewards Credit Card',
    type: 'credit_card',
    currency: 'USD',
    mask: '5510',
    isLiability: true,
  },
];

/** Options for the mock generator. */
export interface MockDataOptions {
  seed?: number;
  /** ISO timestamp of the newest transaction. */
  anchor?: string;
  /** How many months of history to generate. */
  months?: number;
}

/** A generated dataset, ready to be handed to the mock adapter. */
export interface MockDataset {
  accounts: NormalizedAccount[];
  transactions: Map<string, NormalizedTransaction[]>;
  balances: NormalizedBalance[];
}

interface Builder {
  random: Random;
  transactions: Map<string, NormalizedTransaction[]>;
  counters: Map<string, number>;
}

function push(
  builder: Builder,
  accountId: string,
  date: string,
  amountMinor: number,
  description: string,
  sourceCategory?: string,
): void {
  const list = builder.transactions.get(accountId) ?? [];
  const counter = (builder.counters.get(accountId) ?? 0) + 1;
  builder.counters.set(accountId, counter);

  list.push({
    externalId: `mock-${accountId.replace('mock-', '')}-${date.replace(/-/g, '')}-${String(counter).padStart(4, '0')}`,
    accountId,
    postedAt: new Date(`${date}T12:00:00.000Z`),
    pending: false,
    amountMinor,
    currency: 'USD',
    descriptionRaw: description,
    ...(sourceCategory ? { sourceCategory } : {}),
  });
  builder.transactions.set(accountId, list);
}

/**
 * Generates the mock dataset.
 *
 * @example
 * const dataset = generateMockData({ seed: 7 });
 * dataset.transactions.get('mock-checking')?.length; // 214
 */
export function generateMockData(options: MockDataOptions = {}): MockDataset {
  const seed = options.seed ?? DEFAULT_SEED;
  const anchor = new Date(options.anchor ?? DEFAULT_ANCHOR);
  const monthCount = options.months ?? DEFAULT_MONTHS;

  const random = createRandom(seed);
  const builder: Builder = {
    random,
    transactions: new Map(),
    counters: new Map(),
  };

  const months = buildMonths(anchor, monthCount);
  const monthlyCardSpend: number[] = [];

  for (const [monthIndex, month] of months.entries()) {
    const previousCardSpend = monthlyCardSpend[monthIndex - 1] ?? 0;
    const cardSpend = generateCardMonth(builder, month, monthIndex);
    monthlyCardSpend.push(cardSpend);

    generateCheckingMonth(builder, month, monthIndex, previousCardSpend);
    generateSavingsMonth(builder, month);

    // The card payment arrives on the card a couple of days after it leaves
    // checking. It is a transfer, not a refund.
    if (previousCardSpend > 0) {
      push(
        builder,
        'mock-card',
        dayInMonth(month, 22),
        previousCardSpend,
        'PAYMENT RECEIVED - THANK YOU',
        'CARD PAYMENT',
      );
    }
  }

  addPendingTransactions(builder, anchor);
  const balances = buildBalances(builder, months);

  const transactions = new Map<string, NormalizedTransaction[]>();
  for (const account of MOCK_ACCOUNTS) {
    transactions.set(account.externalId, builder.transactions.get(account.externalId) ?? []);
  }

  return { accounts: [...MOCK_ACCOUNTS], transactions, balances };
}

/** Month keys from oldest to newest, e.g. "2025-10" ... "2026-10". */
function buildMonths(anchor: Date, count: number): string[] {
  const months: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - offset, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/** Returns a plain date inside a month, clamped to the month length. */
function dayInMonth(month: string, day: number): string {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const clamped = Math.min(Math.max(day, 1), daysInMonth);
  return `${month}-${String(clamped).padStart(2, '0')}`;
}

function generateCheckingMonth(
  builder: Builder,
  month: string,
  monthIndex: number,
  previousMonthCardSpend: number,
): void {
  const random = builder.random;

  // Salary.
  push(
    builder,
    'mock-checking',
    dayInMonth(month, 1),
    520_000,
    'ACME CORP PAYROLL DIRECT DEP',
    'PAYROLL',
  );

  // Fixed bills.
  for (const bill of BILLS) {
    const amount = pickAmount(random, bill);
    push(
      builder,
      'mock-checking',
      dayInMonth(month, bill.dayOfMonth),
      -amount,
      bill.description,
      bill.sourceCategory,
    );
  }

  // Transfer to savings. The matching inflow lands in the savings account.
  push(
    builder,
    'mock-checking',
    dayInMonth(month, 16),
    -80_000,
    'ONLINE TRANSFER TO SAVINGS 8820',
    'TRANSFER',
  );

  // Credit card payment for the previous statement.
  if (previousMonthCardSpend > 0) {
    push(
      builder,
      'mock-checking',
      dayInMonth(month, 20),
      -previousMonthCardSpend,
      'ONLINE PAYMENT TO CREDIT CARD 5510',
      'CARD PAYMENT',
    );
  }

  // Everyday spending.
  for (const template of [...GROCERIES, ...COFFEE, ...RESTAURANTS, ...GAS, ...SHOPPING]) {
    const count = random.nextInt(template.perMonth[0], template.perMonth[1]);
    for (let index = 0; index < count; index += 1) {
      const day = random.nextInt(1, 28);
      const amount = pickAmount(random, template);
      push(
        builder,
        'mock-checking',
        dayInMonth(month, day),
        -amount,
        template.description,
        template.sourceCategory,
      );
    }
  }

  // The annual premium lands once a year, on the same day.
  if (monthIndex % 12 === 0) {
    push(
      builder,
      'mock-checking',
      dayInMonth(month, 11),
      -41_200,
      'ANNUAL INSURANCE PREMIUM',
      'INSURANCE',
    );
  }

  // A couple of charges the bank cannot categorize. These need review.
  if (monthIndex === 3 || monthIndex === 9) {
    for (const template of UNCATEGORIZED) {
      const amount = pickAmount(random, template);
      push(
        builder,
        'mock-checking',
        dayInMonth(month, random.nextInt(2, 27)),
        -amount,
        template.description,
      );
    }
  }
}

function generateSavingsMonth(builder: Builder, month: string): void {
  const random = builder.random;

  // The transfer arrives one day after it leaves checking.
  push(
    builder,
    'mock-savings',
    dayInMonth(month, 17),
    80_000,
    'ONLINE TRANSFER FROM CHECKING 4417',
    'TRANSFER',
  );

  // Interest.
  const interest = random.nextInt(280, 460);
  push(builder, 'mock-savings', dayInMonth(month, 28), interest, 'INTEREST PAYMENT', 'INTEREST');
}

function generateCardMonth(builder: Builder, month: string, monthIndex: number): number {
  const random = builder.random;
  let spend = 0;

  for (const template of [...GROCERIES, ...COFFEE, ...RESTAURANTS]) {
    const count = random.nextInt(template.perMonth[0], template.perMonth[1]);
    for (let index = 0; index < count; index += 1) {
      const day = random.nextInt(1, 28);
      const amount = pickAmount(random, template);
      push(
        builder,
        'mock-card',
        dayInMonth(month, day),
        -amount,
        template.description,
        template.sourceCategory,
      );
      spend += amount;
    }
  }

  // Subscriptions land on the same day every month.
  for (const subscription of SUBSCRIPTIONS) {
    const increased =
      subscription.priceIncreaseFromMonth !== undefined &&
      monthIndex >= subscription.priceIncreaseFromMonth;
    const amount =
      increased && subscription.increasedAmount !== undefined
        ? subscription.increasedAmount
        : subscription.baseAmount;
    push(
      builder,
      'mock-card',
      dayInMonth(month, subscription.dayOfMonth),
      -amount,
      subscription.description,
      subscription.sourceCategory,
    );
    spend += amount;
  }

  // A refunded flight, once.
  if (monthIndex === 6) {
    push(builder, 'mock-card', dayInMonth(month, 22), 24_500, 'AIRBNB * REFUND 4HK2L9', 'TRAVEL');
  }

  // Two identical charges on the same day look like a duplicate but are not.
  if (monthIndex === 5) {
    const day = dayInMonth(month, 12);
    push(builder, 'mock-checking', day, -525, 'SQ *BLUE BOTTLE COFFEE #12', 'COFFEE');
    push(builder, 'mock-checking', day, -525, 'SQ *BLUE BOTTLE COFFEE #12', 'COFFEE');
  }

  return spend;
}

/** Pending transactions have no posted date yet. */
function addPendingTransactions(builder: Builder, anchor: Date): void {
  const pending = [
    {
      accountId: 'mock-card',
      daysAgo: 1,
      amount: -650,
      description: 'SQ *COFFEE ROASTERS #9',
      sourceCategory: 'COFFEE',
    },
    {
      accountId: 'mock-card',
      daysAgo: 2,
      amount: -4_599,
      description: 'AMZN Mktp US*2K4L9',
      sourceCategory: 'SHOPPING',
    },
    {
      accountId: 'mock-card',
      daysAgo: 3,
      amount: -2_450,
      description: 'TST*DOORDASH - 45TH ST',
      sourceCategory: 'RESTAURANT',
    },
    {
      accountId: 'mock-checking',
      daysAgo: 1,
      amount: -780,
      description: 'SQ *BLUE BOTTLE COFFEE #12',
      sourceCategory: 'COFFEE',
    },
  ];

  for (const item of pending) {
    const date = new Date(anchor.getTime());
    date.setUTCDate(date.getUTCDate() - item.daysAgo);
    const list = builder.transactions.get(item.accountId) ?? [];
    const counter = (builder.counters.get(item.accountId) ?? 0) + 1;
    builder.counters.set(item.accountId, counter);
    list.push({
      externalId: `mock-${item.accountId.replace('mock-', '')}-pending-${String(counter).padStart(4, '0')}`,
      accountId: item.accountId,
      postedAt: null,
      pending: true,
      amountMinor: item.amount,
      currency: 'USD',
      descriptionRaw: item.description,
      ...(item.sourceCategory ? { sourceCategory: item.sourceCategory } : {}),
    });
    builder.transactions.set(item.accountId, list);
  }
}

/** Monthly balance snapshots, computed from the opening balance. */
function buildBalances(builder: Builder, months: readonly string[]): NormalizedBalance[] {
  const balances: NormalizedBalance[] = [];
  const running = new Map<string, number>(
    Object.entries(OPENING_BALANCES).map(([key, value]) => [key, value]),
  );

  for (const month of months) {
    for (const account of MOCK_ACCOUNTS) {
      const list = builder.transactions.get(account.externalId) ?? [];
      for (const transaction of list) {
        if (transaction.pending) continue;
        if (!transaction.postedAt) continue;
        if (transaction.postedAt.toISOString().slice(0, 7) !== month) continue;
        running.set(
          account.externalId,
          (running.get(account.externalId) ?? 0) + transaction.amountMinor,
        );
      }

      balances.push({
        accountExternalId: account.externalId,
        asOf: new Date(`${dayInMonth(month, 28)}T23:59:59.000Z`),
        balanceMinor: running.get(account.externalId) ?? 0,
        currency: 'USD',
      });
    }
  }

  return balances;
}

function pickAmount(random: Random, template: MerchantTemplate): number {
  const [min, max] = template.amount;
  if (min === max) return min;
  // Round to whole cents.
  return random.nextInt(min, max);
}
