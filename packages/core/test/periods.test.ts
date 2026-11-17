import { describe, expect, it } from 'vitest';

import { groupByPeriod, weekStart, type PeriodRow } from '../src/periods.ts';

function row(postedDate: string | null, amountMinor: number, isTransfer = false) {
  return { id: `${postedDate}-${amountMinor}`, postedDate, amountMinor, isTransfer };
}

describe('weekStart', () => {
  it.each([
    ['2026-11-15', '2026-11-15'], // Sunday is its own start
    ['2026-11-18', '2026-11-15'], // Wednesday
    ['2026-11-21', '2026-11-15'], // Saturday
    ['2026-11-22', '2026-11-22'], // next Sunday
  ])('puts %s in the week of %s (Sunday start)', (date, start) => {
    expect(weekStart(date)).toBe(start);
  });

  it('can start weeks on Monday', () => {
    expect(weekStart('2026-11-15', 1)).toBe('2026-11-09'); // Sunday belongs to the week before
    expect(weekStart('2026-11-18', 1)).toBe('2026-11-16');
  });

  it('crosses month and year boundaries', () => {
    expect(weekStart('2026-03-03')).toBe('2026-03-01');
    expect(weekStart('2027-01-01')).toBe('2026-12-27');
  });
});

describe('groupByPeriod', () => {
  const rows = [
    row('2026-11-18', -1200),
    row('2026-11-18', -300),
    row('2026-11-16', 250_000),
    row('2026-11-14', -4500),
    row(null, -999),
  ];

  it('groups by day, newest first, pending on top', () => {
    const groups = groupByPeriod(rows, 'day');

    expect(groups.map((group) => group.key)).toEqual([
      'pending',
      '2026-11-18',
      '2026-11-16',
      '2026-11-14',
    ]);
    expect(groups[1]).toMatchObject({
      start: '2026-11-18',
      end: '2026-11-18',
      outMinor: 1500,
      inMinor: 0,
      netMinor: -1500,
    });
    expect(groups[1]?.rows).toHaveLength(2);
    expect(groups[0]).toMatchObject({ start: null, end: null, outMinor: 999 });
  });

  it('groups by week with the first and last day', () => {
    const groups = groupByPeriod(rows, 'week');

    expect(groups.map((group) => [group.start, group.end])).toEqual([
      [null, null],
      ['2026-11-15', '2026-11-21'],
      ['2026-11-08', '2026-11-14'],
    ]);
    expect(groups[1]).toMatchObject({ outMinor: 1500, inMinor: 250_000, netMinor: 248_500 });
    expect(groups[2]).toMatchObject({ outMinor: 4500, inMinor: 0 });
  });

  it('lists transfers but never counts them', () => {
    const groups = groupByPeriod(
      [row('2026-11-18', -50_000, true), row('2026-11-18', 50_000, true), row('2026-11-18', -700)],
      'day',
    );

    expect(groups[0]?.rows).toHaveLength(3);
    expect(groups[0]).toMatchObject({ outMinor: 700, inMinor: 0, netMinor: -700 });
  });

  it('keeps the row order inside a group, and the extra fields of a row', () => {
    const groups = groupByPeriod(rows, 'week');
    expect(groups[1]?.rows.map((item) => item.id)).toEqual([
      '2026-11-18--1200',
      '2026-11-18--300',
      '2026-11-16-250000',
    ]);
  });

  it('returns nothing for no rows', () => {
    expect(groupByPeriod([] as PeriodRow[], 'week')).toEqual([]);
  });
});
