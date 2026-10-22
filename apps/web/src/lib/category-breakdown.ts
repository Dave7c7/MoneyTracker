/**
 * The category breakdown of a month.
 *
 * The aggregation lives in `core` and the numbers come from one query in the
 * database. This module turns the rows into the shape the screen shows, so
 * the page and the API always answer with the same thing.
 */

import { buildCategoryBreakdown, DEFAULT_MAX_SLICES, type CategorySlice } from '@moneytracker/core';
import type { CategorySpendRow } from '@moneytracker/db';

/** A month's spending, ready to be drawn. */
export interface CategoryBreakdownView {
  /** The month the numbers belong to, e.g. "2026-10". */
  month: string;
  /** What the level adds up to, in minor units. */
  totalMinor: number;
  /** The slices of the first level: the groups, largest first. */
  slices: CategorySlice[];
  /** The colour of every group, by id. */
  colors: Record<string, string>;
}

/**
 * Builds the breakdown of a month from the rows of the query.
 *
 * @example
 * const view = buildCategoryBreakdownView(rows, '2026-10');
 */
export function buildCategoryBreakdownView(
  rows: readonly CategorySpendRow[],
  month: string,
): CategoryBreakdownView {
  const names: Record<string, string> = {};
  const colors: Record<string, string> = {};

  for (const row of rows) {
    names[row.groupId] = row.groupName;
    names[row.categoryId] = row.categoryName;
    if (row.groupColor) colors[row.groupId] = row.groupColor;
  }

  const breakdown = buildCategoryBreakdown(
    rows.map((row) => ({
      groupId: row.groupId,
      categoryId: row.categoryId,
      amountMinor: row.amountMinor,
    })),
    { names, maxSlices: DEFAULT_MAX_SLICES },
  );

  return {
    month,
    totalMinor: breakdown.totalMinor,
    slices: breakdown.slices,
    colors,
  };
}
