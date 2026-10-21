import { NextResponse } from 'next/server';

import { applyRules, deleteRule, updateRule } from '@moneytracker/db';

import { readJson, ruleUpdateSchema } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/**
 * Changes a rule. The transactions it reaches are categorized again, and the
 * response says how many changed.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, ruleUpdateSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const rule = await updateRule(db, userId, id, body.data);
  if (!rule) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const applied = await applyRules(db, userId);
  return NextResponse.json({ rule, applied });
}

/**
 * Deletes a rule. The transactions it used to reach fall back to whatever
 * the rest of the pipeline says.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const deleted = await deleteRule(db, userId, id);
  if (!deleted) return NextResponse.json({ error: 'Rule not found' }, { status: 404 });

  const applied = await applyRules(db, userId);
  return NextResponse.json({ deleted: true, applied });
}
