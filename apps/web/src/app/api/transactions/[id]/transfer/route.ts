import { NextResponse } from 'next/server';

import { markAsTransfer, unmarkTransfer } from '@moneytracker/db';

import { readJson, transferActionSchema } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/**
 * Marks a transaction as a transfer, or takes that back.
 *
 * A transfer is money moving between the user's own accounts. Marking one is
 * a decision the user made, so it is locked: no later rule or detection run
 * takes it away.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, transferActionSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const changed =
    body.data.action === 'mark'
      ? await markAsTransfer(db, userId, id)
      : await unmarkTransfer(db, userId, id);

  if (!changed) {
    return NextResponse.json(
      { error: body.data.action === 'mark' ? 'Already a transfer' : 'Not a transfer' },
      { status: 409 },
    );
  }

  return NextResponse.json({ updated: true });
}
