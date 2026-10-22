import { describe, expect, it } from 'vitest';

import { buildCategoryBreakdown, type CategoryBreakdownRow } from '../src/dashboards.ts';

function row(groupId: string, categoryId: string, amountMinor: number): CategoryBreakdownRow {
  return { groupId, categoryId, amountMinor };
}

describe('the category breakdown', () => {
  it('adds the categories of a group together', () => {
    const breakdown = buildCategoryBreakdown(
      [
        row('housing', 'rent', -225_000),
        row('housing', 'utilities', -10_000),
        row('food', 'groceries', -50_000),
      ],
      {
        names: {
          housing: 'Housing',
          rent: 'Rent',
          utilities: 'Utilities',
          food: 'Food',
          groceries: 'Groceries',
        },
      },
    );

    expect(breakdown.totalMinor).toBe(285_000);
    expect(breakdown.slices).toHaveLength(2);
    expect(breakdown.slices[0]).toMatchObject({
      categoryId: 'housing',
      name: 'Housing',
      amountMinor: 235_000,
    });
    expect(breakdown.slices[0]?.children?.map((child) => child.name)).toEqual([
      'Rent',
      'Utilities',
    ]);
  });

  it('rounds the percentages so they add up to exactly 100', () => {
    const breakdown = buildCategoryBreakdown([
      row('a', 'a1', -333),
      row('b', 'b1', -333),
      row('c', 'c1', -334),
    ]);

    const percents = breakdown.slices.map((slice) => slice.percent);
    expect(percents.reduce((sum, percent) => sum + percent, 0)).toBe(100);
    // The slices are sorted by amount, and the extra percent goes to the one
    // that lost the most to the rounding.
    expect(percents).toEqual([34, 33, 33]);
  });

  it('gives the leftover percent to the largest remainder', () => {
    // 1/6 each: every slice earns 16.66 percent, and two of them get the
    // percent that is left over.
    const breakdown = buildCategoryBreakdown(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((group) => row(group, `${group}1`, -100)),
    );

    const percents = breakdown.slices.map((slice) => slice.percent);
    expect(percents.reduce((sum, percent) => sum + percent, 0)).toBe(100);
    expect(percents.filter((percent) => percent === 17)).toHaveLength(4);
    expect(percents.filter((percent) => percent === 16)).toHaveLength(2);
  });

  it('folds the smallest groups into Other', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((group, index) =>
      row(group, `${group}1`, -(1000 - index * 100)),
    );
    const names: Record<string, string> = {};
    for (const group of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      names[group] = group.toUpperCase();
      names[`${group}1`] = `${group.toUpperCase()} one`;
    }

    const breakdown = buildCategoryBreakdown(rows, { maxSlices: 6, names });

    expect(breakdown.slices).toHaveLength(6);
    const other = breakdown.slices[breakdown.slices.length - 1];
    expect(other).toMatchObject({ categoryId: null, name: 'Other' });
    // The folded groups are the smallest ones, and they are kept as members.
    expect(other?.children?.map((child) => child.name)).toEqual(['F', 'G', 'H']);
    expect(other?.amountMinor).toBe(500 + 400 + 300);
  });

  it('keeps every group when they all fit', () => {
    const breakdown = buildCategoryBreakdown(
      ['a', 'b', 'c'].map((group) => row(group, `${group}1`, -100)),
      { maxSlices: 6 },
    );

    expect(breakdown.slices).toHaveLength(3);
    expect(breakdown.slices.some((slice) => slice.name === 'Other')).toBe(false);
  });

  it('leaves a category that was refunded more than it spent out', () => {
    const breakdown = buildCategoryBreakdown(
      [
        row('food', 'groceries', -50_000),
        row('food', 'refunds', 60_000),
        row('travel', 'flights', -20_000),
      ],
      { names: { food: 'Food', groceries: 'Groceries', travel: 'Travel', flights: 'Flights' } },
    );

    expect(breakdown.totalMinor).toBe(70_000);
    expect(breakdown.slices.map((slice) => slice.name)).toEqual(['Food', 'Travel']);
    expect(breakdown.slices[0]?.children?.map((child) => child.name)).toEqual(['Groceries']);
  });

  it('has nothing to show for an empty month', () => {
    const breakdown = buildCategoryBreakdown([]);

    expect(breakdown.totalMinor).toBe(0);
    expect(breakdown.slices).toEqual([]);
  });

  it('gives the same order every time', () => {
    const rows = [row('b', 'b1', -100), row('a', 'a1', -100), row('c', 'c1', -300)];
    const names = { a: 'A', b: 'B', c: 'C', a1: 'A1', b1: 'B1', c1: 'C1' };

    const first = buildCategoryBreakdown(rows, { names });
    const second = buildCategoryBreakdown([...rows].reverse(), { names });

    expect(first.slices.map((slice) => slice.name)).toEqual(['C', 'A', 'B']);
    expect(second.slices.map((slice) => slice.name)).toEqual(['C', 'A', 'B']);
    expect(first.slices.map((slice) => slice.colorKey)).toEqual(
      second.slices.map((slice) => slice.colorKey),
    );
  });

  it('keeps the group of every child as its colour key', () => {
    const breakdown = buildCategoryBreakdown([row('food', 'groceries', -50_000)]);

    expect(breakdown.slices[0]?.colorKey).toBe('food');
    expect(breakdown.slices[0]?.children?.[0]?.colorKey).toBe('food');
  });

  it('gives the children their share of the group, not of the month', () => {
    const breakdown = buildCategoryBreakdown([
      row('housing', 'rent', -225_000),
      row('housing', 'utilities', -75_000),
      row('food', 'groceries', -100_000),
    ]);

    const housing = breakdown.slices[0];
    expect(housing?.percent).toBe(75);
    expect(housing?.children?.map((child) => child.percent)).toEqual([75, 25]);
  });
});
