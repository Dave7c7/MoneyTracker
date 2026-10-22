import { NextResponse } from 'next/server';

import {
  claimConnection,
  deleteConnection,
  listConnections,
  listProviderAccounts,
  requireEncryptionKey,
} from '@moneytracker/db';

import { connectionSchema, readJson } from '@/lib/api.ts';
import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';

/**
 * The connections of the user.
 */
export async function GET() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const connections = await listConnections(db, userId);
  return NextResponse.json({ connections });
}

/**
 * Connects a bank.
 *
 * The user pastes the setup token the provider gave them. The token is
 * exchanged for a credential, the credential is stored encrypted, and the
 * accounts behind it are listed so the user can pick the ones to keep.
 *
 * The setup token only works once, so the credential is kept before the
 * accounts are shown.
 */
export async function POST(request: Request) {
  const body = await readJson(request, connectionSchema);
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

  let connectionId: string;
  try {
    const connection = await claimConnection(
      db,
      userId,
      {
        adapterId: 'simplefin',
        setupToken: body.data.setupToken,
        name: body.data.name,
        institution: 'SimpleFIN',
        historyDays: body.data.historyDays ?? 90,
        refreshHours: 24,
      },
      key,
    );
    connectionId = connection.id;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The setup token was refused' },
      { status: 400 },
    );
  }

  // The accounts behind the connection, so the user can pick the ones to keep.
  try {
    const accounts = await listProviderAccounts(db, userId, connectionId, key);
    const connection = (await listConnections(db, userId)).find(
      (entry) => entry.id === connectionId,
    );
    return NextResponse.json({ connection, accounts }, { status: 201 });
  } catch (error) {
    await deleteConnection(db, userId, connectionId);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The accounts could not be read' },
      { status: 400 },
    );
  }
}
