import { NextResponse } from 'next/server';

import { requireEncryptionKey, syncAllConnections } from '@moneytracker/db';

import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';

/**
 * Syncs every connection.
 *
 * This is what a scheduler calls: a container has no repository to run a
 * command in, so the app can be asked to refresh itself.
 */
export async function POST() {
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
    const outcome = await syncAllConnections(db, userId, key);
    return NextResponse.json({ outcome });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The sync failed' },
      { status: 400 },
    );
  }
}
