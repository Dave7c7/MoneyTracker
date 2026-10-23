import { NextResponse } from 'next/server';

import { markAlertRead, markAllAlertsRead } from '@moneytracker/db';

import { alertActionSchema } from '@/lib/api.ts';
import { readJson } from '@/lib/api.ts';
import { getSessionUserId } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * Marks alerts as seen.
 *
 * Two actions: one alert, or the whole inbox. Only the read flag changes —
 * an alert is a record of something that happened, so it is not deleted by
 * reading it.
 */
export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const body = await readJson(request, alertActionSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();

  if (body.data.action === 'read-all') {
    const count = await markAllAlertsRead(db, userId);
    return NextResponse.json({ ok: true, count });
  }

  const marked = await markAlertRead(db, userId, body.data.id);
  return NextResponse.json({ ok: true, marked });
}
