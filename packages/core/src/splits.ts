/**
 * Splits.
 *
 * One charge can be more than one thing: a hotel bill that is also dinner, a
 * shop run that is groceries and household. A split says so without changing
 * the row the bank gave us.
 *
 * The parts always add up to the whole. That is the one rule, and these
 * functions are where it is checked.
 */

import { sumMinorAmounts } from './money.ts';

/** One part of a split. */
export interface SplitPart {
  categoryId: string;
  /** Signed amount in minor units. */
  amountMinor: number;
}

/** How a split stands. */
export interface SplitBalance {
  /** True when the parts add up to the whole. */
  balanced: boolean;
  /** How much is left over, in minor units. Positive means too much. */
  differenceMinor: number;
  /** The sum of the parts, in minor units. */
  totalMinor: number;
}

/**
 * Checks whether the parts of a split add up to the whole.
 *
 * @example
 * splitBalance([{ categoryId: 'a', amountMinor: -6000 }, { categoryId: 'b', amountMinor: -4000 }], -10000);
 * // { balanced: true, differenceMinor: 0, totalMinor: -10000 }
 */
export function splitBalance(
  parts: readonly SplitPart[],
  totalMinor: number,
): SplitBalance {
  const total = parts.length === 0 ? 0 : sumMinorAmounts(parts.map((part) => part.amountMinor));
  return {
    balanced: total === totalMinor,
    differenceMinor: total - totalMinor,
    totalMinor: total,
  };
}

/**
 * How much of a transaction is not split yet.
 *
 * @example
 * splitRemainder([{ categoryId: 'a', amountMinor: -6000 }], -10000); // -4000
 */
export function splitRemainder(
  parts: readonly SplitPart[],
  totalMinor: number,
): number {
  return totalMinor - splitBalance(parts, totalMinor).totalMinor;
}
