import { NextResponse } from 'next/server';

import { bulkSetCategory, currentAssignments } from '@moneytracker/db';

import { bulkCategorySchema, readJson } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/**
 * Changes the category of several transactions at once.
 *
 * The response carries the assignments they had before, so the UI can offer
 * an undo.
 */
export async function POST(request: Request) {
  const body = await readJson(request, bulkCategorySchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const previous = await currentAssignments(db, userId, body.data.transactionIds);
  const changed = await bulkSetCategory(db, userId, body.data.transactionIds, body.data.categoryId);

  return NextResponse.json({ changed, previous });
}
