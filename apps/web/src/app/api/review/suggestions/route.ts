import { NextResponse } from 'next/server';

import { applyRules } from '@moneytracker/db';

import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/**
 * Runs the categorization pipeline over every transaction that is not locked,
 * so transactions imported before keyword suggestions existed get one too.
 * Manual edits are never touched; the response says how many changed.
 */
export async function POST() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const applied = await applyRules(db, userId);
  return NextResponse.json({ applied });
}
