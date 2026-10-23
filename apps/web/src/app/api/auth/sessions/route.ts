import { NextResponse } from 'next/server';

import { revokeSession, signOutEverywhere } from '@moneytracker/db';

import { getSessionToken, getSessionUserId } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * Ends every other session of the user.
 *
 * The one making the request stays signed in: this is for the machine that was
 * left open somewhere, not for the one being used.
 */
export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const { db } = getDatabase();
  const token = await getSessionToken();

  // A single session, when the screen asks for one.
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('id');
  if (sessionId) {
    const removed = await revokeSession(db, userId, sessionId);
    return NextResponse.json({ ok: removed });
  }

  await signOutEverywhere(db, userId, token ?? undefined);
  return NextResponse.json({ ok: true });
}
