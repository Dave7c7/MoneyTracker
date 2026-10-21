import { NextResponse } from 'next/server';

import { applyRules, reorderRules } from '@moneytracker/db';

import { readJson, reorderSchema } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/**
 * Reorders the rules. The first id in the list wins the lowest priority.
 */
export async function POST(request: Request) {
  const body = await readJson(request, reorderSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  await reorderRules(db, userId, body.data.ids);
  const applied = await applyRules(db, userId);

  return NextResponse.json({ reordered: true, applied });
}
