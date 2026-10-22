import { NextResponse } from 'next/server';

import { deleteConnection, listConnections, listLinkedAccounts } from '@moneytracker/db';

import { getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * Removes a connection.
 *
 * The accounts it fed stay in the app; they are simply no longer refreshed.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const deleted = await deleteConnection(db, userId, id);
  if (!deleted) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  return NextResponse.json({ deleted: true });
}

/**
 * What one connection holds: the accounts it feeds and how it is doing.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const connection = (await listConnections(db, userId)).find((entry) => entry.id === id);
  if (!connection) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  const accounts = await listLinkedAccounts(db, userId, id);
  return NextResponse.json({ connection, accounts });
}
