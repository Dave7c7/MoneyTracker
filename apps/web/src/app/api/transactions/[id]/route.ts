import { NextResponse } from 'next/server';

import { setManualCategory } from '@moneytracker/db';

import { readJson, manualCategorySchema } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/**
 * Changes the category of one transaction by hand.
 *
 * The assignment is locked: no later rule or re-categorization run will
 * overwrite it.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, manualCategorySchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const updated = await setManualCategory(db, userId, id, body.data.categoryId);
  if (!updated) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

  return NextResponse.json({ updated: true });
}
