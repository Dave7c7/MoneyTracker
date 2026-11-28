/**
 * Safe to spend: what is left for the rest of the month.
 *
 * One number, worked out from what the app already knows, and every part of
 * it is returned so the screen can show where it comes from:
 *
 *   expected income   the larger of this month's income so far and the
 *                     average of the last three months that had income
 * − spent             posted spending this month (refunds count back)
 * − pending           charges that have not posted yet
 * − bills still due   recurring charges expected from today to month end
 * − set aside         what each savings goal with a deadline needs this month
 * = safe to spend     negative when the month is already over
 *
 * Transfers and card payments are never spending, so they are left out.
 */

import { cashFlowByMonth, spendingInMonth, type DashboardTransaction } from './dashboards.ts';
import { addMonths, monthKeyFromPlainDate, type MonthKey, type PlainDate } from './dates.ts';

/** A recurring charge, as the calculation needs it. */
export interface SafeToSpendBillInput {
  merchantName: string;
  /** Positive: what the charge costs. */
  amountMinor: number;
  nextDate: PlainDate;
  status: 'detected' | 'confirmed' | 'dismissed';
}

/** A savings goal, as the calculation needs it. */
export interface SafeToSpendGoalInput {
  name: string;
  reached: boolean;
  /** Null for a goal with no deadline: it has no monthly amount. */
  neededPerMonthMinor: number | null;
}

/** What safe to spend is worked out from. */
export interface SafeToSpendInput {
  transactions: readonly DashboardTransaction[];
  recurring: readonly SafeToSpendBillInput[];
  goals: readonly SafeToSpendGoalInput[];
  /** Today, in the user's timezone. */
  today: PlainDate;
  timeZone: string;
}

/** Where the expected income comes from. */
export type IncomeBasis = 'this-month' | 'average' | 'none';

/** Safe to spend, with every part of it. */
export interface SafeToSpend {
  month: MonthKey;
  /** What can still be spent this month. Negative when over. */
  safeMinor: number;
  /** Safe to spend per remaining day, today included. Zero when over. */
  perDayMinor: number;
  /** Days left in the month, today included. */
  daysLeft: number;
  incomeMinor: number;
  incomeBasis: IncomeBasis;
  /** Income received so far this month. */
  incomeThisMonthMinor: number;
  /** Average monthly income of the months it was based on. */
  averageIncomeMinor: number;
  /** How many past months the average uses (0 to 3). */
  averageMonths: number;
  spentMinor: number;
  pendingMinor: number;
  billsMinor: number;
  bills: { name: string; amountMinor: number; date: PlainDate }[];
  savingsMinor: number;
  savings: { name: string; amountMinor: number }[];
  overspent: boolean;
}

/** How many past months the income average looks at. */
const AVERAGE_MONTHS = 3;

/**
 * Works out safe to spend for the month that contains `today`.
 *
 * @example
 * safeToSpend({ transactions, recurring, goals, today: '2026-11-28', timeZone: 'America/New_York' }).safeMinor;
 */
export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const month = monthKeyFromPlainDate(input.today);
  const lastDay = lastDayOfMonth(month);
  const daysLeft = lastDay - Number(input.today.slice(8, 10)) + 1;
  const monthEnd: PlainDate = `${month}-${String(lastDay).padStart(2, '0')}`;

  // Income: this month so far against the recent average.
  const pastMonths = [1, 2, 3]
    .slice(0, AVERAGE_MONTHS)
    .map((back) => addMonths(month, -back))
    .reverse();
  const flow = cashFlowByMonth(input.transactions, {
    timeZone: input.timeZone,
    months: [...pastMonths, month],
  });
  const incomeThisMonthMinor = flow[flow.length - 1]?.incomeMinor ?? 0;
  const pastIncome = flow
    .slice(0, -1)
    .map((entry) => entry.incomeMinor)
    .filter((value) => value > 0);
  const averageIncomeMinor =
    pastIncome.length > 0
      ? Math.floor(pastIncome.reduce((sum, value) => sum + value, 0) / pastIncome.length)
      : 0;

  let incomeBasis: IncomeBasis = 'none';
  if (incomeThisMonthMinor > 0 || averageIncomeMinor > 0) {
    incomeBasis = incomeThisMonthMinor >= averageIncomeMinor ? 'this-month' : 'average';
  }
  const incomeMinor = Math.max(incomeThisMonthMinor, averageIncomeMinor);

  // Spending: what posted, and what is still pending.
  const spentMinor = spendingInMonth(input.transactions, month, input.timeZone);
  const pendingMinor = input.transactions
    .filter(
      (tx) =>
        tx.pending &&
        tx.amountMinor < 0 &&
        (tx.categoryKind === 'spending' || tx.categoryKind === 'uncategorized'),
    )
    .reduce((sum, tx) => sum - tx.amountMinor, 0);

  // Bills expected between today and the end of the month.
  const bills = input.recurring
    .filter(
      (item) =>
        item.status !== 'dismissed' &&
        item.amountMinor > 0 &&
        item.nextDate >= input.today &&
        item.nextDate <= monthEnd,
    )
    .map((item) => ({
      name: item.merchantName,
      amountMinor: item.amountMinor,
      date: item.nextDate,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const billsMinor = bills.reduce((sum, bill) => sum + bill.amountMinor, 0);

  // Savings goals that need money this month.
  const savings = input.goals
    .filter(
      (goal) => !goal.reached && goal.neededPerMonthMinor !== null && goal.neededPerMonthMinor > 0,
    )
    .map((goal) => ({ name: goal.name, amountMinor: goal.neededPerMonthMinor ?? 0 }));
  const savingsMinor = savings.reduce((sum, goal) => sum + goal.amountMinor, 0);

  const safeMinor = incomeMinor - spentMinor - pendingMinor - billsMinor - savingsMinor;
  const perDayMinor = safeMinor > 0 ? Math.floor(safeMinor / daysLeft) : 0;

  return {
    month,
    safeMinor,
    perDayMinor,
    daysLeft,
    incomeMinor,
    incomeBasis,
    incomeThisMonthMinor,
    averageIncomeMinor,
    averageMonths: pastIncome.length,
    spentMinor,
    pendingMinor,
    billsMinor,
    bills,
    savingsMinor,
    savings,
    overspent: safeMinor < 0,
  };
}

/** The number of days in a month. */
function lastDayOfMonth(month: MonthKey): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0)).getUTCDate();
}
