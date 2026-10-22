import { NextResponse } from 'next/server';

import { addDaysToPlainDate, addMonths, plainDateInMonth, toPlainDate } from '@moneytracker/core';
import {
  createManualRecurringItem,
  detectRecurringItems,
  listRecurringItems,
} from '@moneytracker/db';

import { manualRecurringSchema, readJson } from '@/lib/api.ts';
import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * The recurring charges of the user: subscriptions and bills.
 *
 * The list is what the detector found plus what the user added by hand.
 */
export async function GET() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const items = await listRecurringItems(db, userId);
  return NextResponse.json({ items });
}

/**
 * Adds a bill the user knows about and the app has not found.
 *
 * The user says which day of the month it lands; the server works out when
 * the next one is due.
 */
export async function POST(request: Request) {
  const body = await readJson(request, manualRecurringSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const input = body.data;
  const today = toPlainDate(new Date());
  const nextDate = nextOccurrence(
    today,
    input.cadence,
    input.dayOfMonth,
    input.monthOfYear ?? null,
  );

  const item = await createManualRecurringItem(db, userId, {
    name: input.name,
    amountMinor: input.amountMinor,
    currency: input.currency,
    cadence: input.cadence,
    nextDate,
    accountId: input.accountId ?? null,
    categoryId: input.categoryId ?? null,
  });

  return NextResponse.json({ item }, { status: 201 });
}

/**
 * Looks for recurring charges again.
 *
 * The screen does this when it opens; this route is for when the user wants
 * to look now.
 */
export async function PUT() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const result = await detectRecurringItems(db, userId);
  return NextResponse.json({ detected: result.detected, added: result.added, items: result.items });
}

/**
 * The next time a bill lands.
 *
 * A monthly bill lands on its day of the month; an annual one lands on its
 * day and month. Today counts as due today.
 */
function nextOccurrence(
  today: string,
  cadence: 'weekly' | 'monthly' | 'annual',
  dayOfMonth: number,
  monthOfYear: number | null,
): string {
  if (cadence === 'weekly') return addDaysToPlainDate(today, 7);

  const thisMonth = today.slice(0, 7);
  const thisYear = Number(today.slice(0, 4));

  if (cadence === 'annual') {
    const month = monthOfYear ?? Number(today.slice(5, 7));
    const candidate = plainDateInMonth(`${thisYear}-${String(month).padStart(2, '0')}`, dayOfMonth);
    if (candidate >= today) return candidate;
    return plainDateInMonth(`${thisYear + 1}-${String(month).padStart(2, '0')}`, dayOfMonth);
  }

  const candidate = plainDateInMonth(thisMonth, dayOfMonth);
  if (candidate >= today) return candidate;
  return plainDateInMonth(addMonths(thisMonth, 1), dayOfMonth);
}
