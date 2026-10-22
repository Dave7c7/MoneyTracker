import { NextResponse } from 'next/server';

import { requireEncryptionKey, syncConnection } from '@moneytracker/db';

import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';

/**
 * Syncs one connection now.
 *
 * The data goes through the same pipeline as everything else, so a sync
 * never creates a duplicate and never overwrites a correction.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  let key: string;
  try {
    key = requireEncryptionKey(getEnv().ENCRYPTION_KEY);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'ENCRYPTION_KEY is missing' },
      { status: 500 },
    );
  }

  try {
    const result = await syncConnection(db, userId, id, key);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The sync failed' },
      { status: 400 },
    );
  }
}
