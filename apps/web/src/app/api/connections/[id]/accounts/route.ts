import { NextResponse } from 'next/server';

import { linkConnectionAccounts, requireEncryptionKey } from '@moneytracker/db';

import { linkAccountsSchema, readJson } from '@/lib/api.ts';
import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';

/**
 * Links the accounts of a provider to a connection.
 *
 * The accounts are imported as they are linked, so the user sees the
 * transactions right away. An account belongs to one connection, so linking
 * it to another one moves it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, linkAccountsSchema);
  if (!body.ok) return body.response;

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
    const result = await linkConnectionAccounts(db, userId, id, body.data.externalIds, key);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The accounts could not be linked' },
      { status: 400 },
    );
  }
}
