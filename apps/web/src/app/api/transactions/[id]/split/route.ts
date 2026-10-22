import { NextResponse } from 'next/server';

import { clearTransactionSplit, setTransactionSplit } from '@moneytracker/db';

import { readJson, splitBodySchema } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/**
 * Splits a transaction across categories, or takes the split away.
 *
 * The parts have to add up to the amount of the transaction, and the server
 * says so when they do not.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, splitBodySchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const outcome = await setTransactionSplit(db, userId, id, body.data.lines);
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason }, { status: 400 });

  return NextResponse.json({
    split: outcome.lines.map((line) => ({
      id: line.id,
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      amountMinor: line.amountMinor,
    })),
  });
}

/** Removes the split of a transaction. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const removed = await clearTransactionSplit(db, userId, id);
  if (!removed) return NextResponse.json({ error: 'This transaction is not split' }, { status: 404 });

  return NextResponse.json({ removed: true });
}
