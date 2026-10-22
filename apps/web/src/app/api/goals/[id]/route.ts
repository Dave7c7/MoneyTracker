import { NextResponse } from 'next/server';

import { deleteSavingsGoal, updateSavingsGoal } from '@moneytracker/db';

import { goalUpdateSchema, readJson } from '@/lib/api.ts';
import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';

/** Changes a goal: what has been set aside, the target, or the deadline. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, goalUpdateSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const goal = await updateSavingsGoal(db, userId, id, body.data);
  if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

  return NextResponse.json({ goal });
}

/** Removes a goal. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const deleted = await deleteSavingsGoal(db, userId, id);
  if (!deleted) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
