import { NextResponse } from 'next/server';

import { deleteRecurringItem, setRecurringItemStatus } from '@moneytracker/db';

import { readJson, recurringStatusSchema } from '@/lib/api.ts';
import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * A decision about a recurring charge.
 *
 * Confirming it says the app got it right; dismissing it says it did not, and
 * the app never brings it back.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, recurringStatusSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const item = await setRecurringItemStatus(db, userId, id, body.data.status);
  if (!item) return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });

  return NextResponse.json({ item });
}

/** Removes a recurring item. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const deleted = await deleteRecurringItem(db, userId, id);
  if (!deleted) return NextResponse.json({ error: 'Recurring item not found' }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
