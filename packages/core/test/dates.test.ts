import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  differenceInDays,
  formatMonthLabel,
  monthKey,
  monthKeyFromPlainDate,
  monthRange,
  parsePlainDate,
  toPlainDate,
} from '../src/dates.ts';

describe('dates', () => {
  it('stores plain UTC dates without shifting', () => {
    expect(toPlainDate(new Date('2026-01-31T23:30:00Z'))).toBe('2026-01-31');
    expect(toPlainDate(new Date('2026-01-31T00:30:00Z'))).toBe('2026-01-31');
  });

  it('parses a plain date at UTC midnight', () => {
    expect(parsePlainDate('2026-01-31').toISOString()).toBe('2026-01-31T00:00:00.000Z');
  });

  it('buckets months in the user timezone', () => {
    // 2am UTC on Feb 1st is still January on the US west coast.
    expect(monthKey(new Date('2026-02-01T02:00:00Z'), 'America/Los_Angeles')).toBe('2026-01');
    expect(monthKey(new Date('2026-02-01T02:00:00Z'), 'UTC')).toBe('2026-02');
    expect(monthKey(new Date('2026-01-31T23:00:00Z'), 'Asia/Tokyo')).toBe('2026-02');
  });

  it('derives a month from a plain date', () => {
    expect(monthKeyFromPlainDate('2026-01-31')).toBe('2026-01');
  });

  it('adds months across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-06', 12)).toBe('2027-06');
  });

  it('lists a range of months', () => {
    expect(monthRange('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('adds and subtracts days', () => {
    expect(addDays(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-01T00:00:00.000Z',
    );
    expect(addDays(new Date('2026-03-01T00:00:00Z'), -1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('counts whole days between instants', () => {
    expect(
      differenceInDays(new Date('2026-01-02T00:00:00Z'), new Date('2026-01-01T00:00:00Z')),
    ).toBe(1);
    expect(
      differenceInDays(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z')),
    ).toBe(-1);
  });

  it('formats a month for display', () => {
    expect(formatMonthLabel('2026-01')).toBe('Jan 2026');
  });
});
