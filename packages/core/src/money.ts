/**
 * Money helpers.
 *
 * Every amount in this app is an integer number of minor units (cents).
 * There is no floating point arithmetic on money anywhere in the codebase;
 * these helpers are the only place where amounts are split or summed.
 */

const MINOR_UNITS_PER_UNIT = 100;

/** Thrown when an amount is not a valid integer number of minor units. */
export class InvalidAmountError extends Error {
  constructor(value: unknown) {
    super(`Amount must be an integer number of minor units, received: ${String(value)}`);
    this.name = 'InvalidAmountError';
  }
}

/**
 * Asserts that a value is a safe integer amount in minor units.
 *
 * @example
 * assertMinorAmount(-1999); // ok
 * assertMinorAmount(19.99); // throws InvalidAmountError
 */
export function assertMinorAmount(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidAmountError(value);
  }
  return value;
}

/**
 * Sums minor-unit amounts exactly.
 *
 * @example
 * sumMinorAmounts([-1999, -250]); // -2249
 */
export function sumMinorAmounts(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    total += assertMinorAmount(value);
  }
  return assertMinorAmount(total);
}

/**
 * Splits `totalMinor` across `weights` so the parts always sum to the total.
 *
 * Uses the largest-remainder method: each part gets the floor of its exact
 * share, then the leftover minor units go to the parts with the biggest
 * fractional remainder (ties broken by index) so the result is deterministic.
 *
 * @example
 * allocateSplit(1000, [1, 1, 1]); // [334, 333, 333]
 * allocateSplit(-1000, [1, 1, 1]); // [-333, -333, -334]
 */
export function allocateSplit(totalMinor: number, weights: readonly number[]): number[] {
  assertMinorAmount(totalMinor);
  if (weights.length === 0) {
    return [];
  }
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new Error(`Split weights must be finite and non-negative, received: ${String(weight)}`);
    }
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight === 0) {
    throw new Error('Split weights must not sum to zero');
  }

  const exact = weights.map((weight) => (totalMinor * weight) / totalWeight);
  const parts = exact.map((value) => Math.floor(value));
  let remainder = totalMinor - parts.reduce((sum, part) => sum + part, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  let cursor = 0;
  while (remainder > 0) {
    parts[order[cursor % order.length]!.index]! += 1;
    remainder -= 1;
    cursor += 1;
  }
  while (remainder < 0) {
    parts[order[cursor % order.length]!.index]! -= 1;
    remainder += 1;
    cursor += 1;
  }

  return parts;
}

/**
 * Splits an amount into a number of equal parts that sum exactly to it.
 *
 * @example
 * splitEvenly(1000, 3); // [334, 333, 333]
 */
export function splitEvenly(totalMinor: number, count: number): number[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Split count must be a positive integer, received: ${String(count)}`);
  }
  return allocateSplit(totalMinor, new Array<number>(count).fill(1));
}

/**
 * Formats an amount for display. This is the only place money becomes text.
 *
 * @example
 * formatMoney(-1999, 'USD', 'en-US'); // "-$19.99"
 */
export function formatMoney(amountMinor: number, currency: string, locale = 'en-US'): string {
  assertMinorAmount(amountMinor);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amountMinor / MINOR_UNITS_PER_UNIT);
}

/**
 * Formats an amount without the currency symbol, e.g. for chart axes.
 *
 * @example
 * formatMoneyPlain(-1999, 'en-US'); // "-19.99"
 */
export function formatMoneyPlain(amountMinor: number, locale = 'en-US'): string {
  assertMinorAmount(amountMinor);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / MINOR_UNITS_PER_UNIT);
}

/**
 * Converts a major-unit amount (e.g. 19.99 dollars) to minor units.
 *
 * Rounds half away from zero, which is the behaviour people expect when a
 * percentage split lands exactly on half a cent.
 *
 * @example
 * toMinorUnits(19.99); // 1999
 */
export function toMinorUnits(amountMajor: number): number {
  if (!Number.isFinite(amountMajor)) {
    throw new Error(`Amount must be finite, received: ${String(amountMajor)}`);
  }
  const scaled = Math.round(Math.abs(amountMajor) * MINOR_UNITS_PER_UNIT) * Math.sign(amountMajor);
  return assertMinorAmount(scaled);
}

/**
 * Converts minor units back to a major-unit number. Display only.
 *
 * @example
 * toMajorUnits(1999); // 19.99
 */
export function toMajorUnits(amountMinor: number): number {
  assertMinorAmount(amountMinor);
  return amountMinor / MINOR_UNITS_PER_UNIT;
}
