import { describe, expect, it } from 'vitest';

import {
  allocateSplit,
  assertMinorAmount,
  formatMoney,
  InvalidAmountError,
  splitEvenly,
  sumMinorAmounts,
  toMajorUnits,
  toMinorUnits,
} from '../src/money.ts';
import { createRandom } from '../src/random.ts';

describe('money', () => {
  it('rejects non-integer amounts', () => {
    expect(() => assertMinorAmount(19.99)).toThrow(InvalidAmountError);
    expect(() => assertMinorAmount(Number.NaN)).toThrow(InvalidAmountError);
    expect(assertMinorAmount(-1999)).toBe(-1999);
  });

  it('sums minor units exactly', () => {
    expect(sumMinorAmounts([-1999, -250, 5000])).toBe(2751);
    expect(sumMinorAmounts([])).toBe(0);
  });

  it('keeps the sign convention: money out is negative, money in is positive', () => {
    // Credit card purchase: money out, so negative.
    const cardPurchase = -4599;
    // Refund on the card: money in, so positive.
    const cardRefund = 4599;
    // Paycheck into checking: money in, so positive.
    const paycheck = 412500;

    expect(cardPurchase).toBeLessThan(0);
    expect(cardRefund).toBeGreaterThan(0);
    expect(paycheck).toBeGreaterThan(0);
  });

  it('allocates a split so the parts always sum to the original', () => {
    expect(allocateSplit(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocateSplit(1000, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(allocateSplit(-1000, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(-1000);
    expect(allocateSplit(-1000, [1, 1, 1])).toEqual([-333, -333, -334]);
  });

  it('allocates remainders deterministically', () => {
    const first = allocateSplit(1001, [5, 5, 5, 5]);
    const second = allocateSplit(1001, [5, 5, 5, 5]);
    expect(first).toEqual(second);
    expect(first.reduce((a, b) => a + b, 0)).toBe(1001);
  });

  it('splits evenly without losing a cent', () => {
    const parts = splitEvenly(1000, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });

  it('never loses a cent across many random splits', () => {
    const random = createRandom(20260121);
    for (let i = 0; i < 500; i += 1) {
      const total = random.nextInt(-1_000_000, 1_000_000);
      const count = random.nextInt(1, 12);
      const weights = new Array<number>(count).fill(0).map(() => random.nextInt(1, 100));
      const parts = allocateSplit(total, weights);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
      for (const part of parts) {
        expect(Number.isInteger(part)).toBe(true);
      }
    }
  });

  it('formats money only at the UI edge', () => {
    expect(formatMoney(-1999, 'USD', 'en-US')).toBe('-$19.99');
    expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56');
  });

  it('converts between major and minor units', () => {
    expect(toMinorUnits(19.99)).toBe(1999);
    expect(toMinorUnits(-19.99)).toBe(-1999);
    expect(toMajorUnits(1999)).toBe(19.99);
  });
});
