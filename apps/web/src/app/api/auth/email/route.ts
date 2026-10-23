import { NextResponse } from 'next/server';

import { changeEmail } from '@moneytracker/db';

import { emailChangeSchema, readJson } from '@/lib/api.ts';
import { getSessionUserId } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';
import { checkRateLimit } from '@/lib/rate-limit.ts';

/**
 * Changes the address the app signs in with.
 *
 * The current password is required, because the address is how the account is
 * found: a session that was left open on another machine should not be able to
 * move it.
 */
export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  // Moving the address needs the password, so it is a guessing surface too.
  const limited = checkRateLimit('email', request);
  if (limited) return limited;

  const body = await readJson(request, emailChangeSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const result = await changeEmail(db, userId, body.data.currentPassword, body.data.email);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, email: result.email });
}
