/**
 * Savings goals.
 *
 * A goal is tracking only. The app never moves money: it shows what the user
 * said they set aside, or what a linked account holds, against the target.
 */

import { differenceInDays, type PlainDate } from './dates.ts';

/** What the user wants to reach. */
export interface SavingsGoal {
  id: string;
  name: string;
  /** The amount to reach, in minor units. */
  targetMinor: number;
  /** What the user says they set aside, when the goal is not linked. */
  savedMinor: number;
  /** The account the progress is read from, when it is linked. */
  accountId: string | null;
  /** The day the goal should be reached. */
  deadline: PlainDate | null;
}

/** How a goal is doing. */
export interface GoalProgress {
  goalId: string;
  name: string;
  targetMinor: number;
  /** What is saved, in minor units. */
  savedMinor: number;
  /** What is still missing. Never negative. */
  remainingMinor: number;
  /** How much of the target is reached, as a percentage. */
  percentComplete: number;
  /** True when the target is reached. */
  reached: boolean;
  /** Whole days until the deadline. Negative when it has passed. */
  daysLeft: number | null;
  /**
   * What has to be saved per month to reach the target in time.
   *
   * Null when there is no deadline, or when the target is already reached.
   */
  neededPerMonthMinor: number | null;
}

/**
 * How far a goal has come.
 *
 * A goal linked to an account uses the balance of that account; a goal that
 * is not linked uses what the user said they set aside.
 *
 * @example
 * goalProgress(goal, { today: '2026-10-22' }).percentComplete; // 40
 */
export function goalProgress(
  goal: SavingsGoal,
  options: { today: PlainDate; accountBalanceMinor?: number | null },
): GoalProgress {
  const savedMinor =
    goal.accountId !== null &&
    options.accountBalanceMinor !== undefined &&
    options.accountBalanceMinor !== null
      ? options.accountBalanceMinor
      : goal.savedMinor;

  const remainingMinor = Math.max(0, goal.targetMinor - savedMinor);
  const percentComplete =
    goal.targetMinor > 0
      ? Math.min(100, Math.round((savedMinor / goal.targetMinor) * 1000) / 10)
      : 0;
  const reached = savedMinor >= goal.targetMinor;

  let daysLeft: number | null = null;
  let neededPerMonthMinor: number | null = null;
  if (goal.deadline) {
    daysLeft = differenceInDays(parseDate(goal.deadline), parseDate(options.today));
    const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
    if (!reached && daysLeft > 0) {
      neededPerMonthMinor = Math.ceil(remainingMinor / monthsLeft);
    }
  }

  return {
    goalId: goal.id,
    name: goal.name,
    targetMinor: goal.targetMinor,
    savedMinor,
    remainingMinor,
    percentComplete,
    reached,
    daysLeft,
    neededPerMonthMinor,
  };
}

/** Turns a plain date into a UTC instant. */
function parseDate(date: PlainDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
