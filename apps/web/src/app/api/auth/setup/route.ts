import { NextResponse } from 'next/server';

import { getLocalUser, hasPassword, setPassword, signIn } from '@moneytracker/db';

import { passwordBodySchema, readJson } from '@/lib/api.ts';
import { setSessionCookie } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit.ts';

/**
 * Sets the password the first time.
 *
 * There is no open registration: this only works while the app has no password
 * at all. Once one is set, the route refuses every request, so an address on
 * the network cannot claim an app that is already in use.
 */
export async function POST(request: Request) {
  const limited = checkRateLimit('setup', request);
  if (limited) return limited;

  const body = await readJson(request, passwordBodySchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const user = await getLocalUser(db);
  if (!user) {
    return NextResponse.json({ error: 'There is no user to set a password for.' }, { status: 503 });
  }

  if (await hasPassword(db, user.id)) {
    return NextResponse.json(
      { error: 'A password is already set. Sign in with it instead.' },
      { status: 409 },
    );
  }

  try {
    await setPassword(db, user.id, body.data.password);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'That password cannot be used.' },
      { status: 400 },
    );
  }

  // The new password signs the person straight in: they just proved they are
  // the one setting it.
  const result = await signIn(db, {
    email: user.email,
    password: body.data.password,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent'),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'The password was set, but signing in failed.' },
      { status: 500 },
    );
  }

  await setSessionCookie(result.token, result.expiresAt, request);
  clearRateLimit('setup', request);
  return NextResponse.json({ ok: true }, { status: 201 });
}
