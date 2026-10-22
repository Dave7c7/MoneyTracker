import { NextResponse } from 'next/server';

import { getCategorySpendByMonth } from '@moneytracker/db';

import { buildCategoryBreakdownView } from '@/lib/category-breakdown.ts';
import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * What was spent in a month, by group and by category.
 *
 * The month is a plain month key, e.g. "2026-10". The answer is the same
 * shape the page renders, so a screen that reloads shows the same thing as
 * the one the server sent.
 */
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'A month is needed, e.g. 2026-10' }, { status: 400 });
  }

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const rows = await getCategorySpendByMonth(db, userId, { month });
  return NextResponse.json(buildCategoryBreakdownView(rows, month));
}
