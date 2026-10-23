import { NextResponse } from 'next/server';

import { changePassword } from '@moneytracker/db';

import { passwordChangeSchema, readJson } from '@/lib/api.ts';
import { getSessionToken, getSessionUserId } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';
import { checkRateLimit } from '@/lib/rate-limit.ts';

/**
 * Changes the password.
 *
 * The current password is required, so a stolen session cannot lock the owner
 * out. Every other session is ended, which is what a password change is for.
 */
export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  // Each try costs a hash, and a stolen session should not be able to grind
  // through guesses at the current password.
  const limited = checkRateLimit('password', request);
  if (limited) return limited;

  const body = await readJson(request, passwordChangeSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const token = (await getSessionToken()) ?? '';

  const result = await changePassword(
    db,
    userId,
    token,
    body.data.currentPassword,
    body.data.newPassword,
  );

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
