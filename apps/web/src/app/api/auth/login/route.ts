import { NextResponse } from 'next/server';
import { z } from 'zod';

import { signIn, LOCK_MINUTES, MAX_FAILED_LOGINS } from '@moneytracker/db';

import { setSessionCookie } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';
import { readJson } from '@/lib/api.ts';
import { checkRateLimit, clearRateLimit } from '@/lib/rate-limit.ts';

const signInSchema = z.object({
  email: z.string().trim().min(1, 'An email is required.'),
  password: z.string().min(1, 'A password is required.'),
});

/**
 * Signs in.
 *
 * The answer says the same thing for an unknown email and a wrong password, so
 * the form cannot be used to find out which addresses exist.
 */
export async function POST(request: Request) {
  // Before the hash: a client that has had enough of its tries does not get to
  // spend the server's.
  const limited = checkRateLimit('login', request);
  if (limited) return limited;

  const body = await readJson(request, signInSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();

  const result = await signIn(db, {
    email: body.data.email,
    password: body.data.password,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent'),
  });

  if (!result.ok) {
    if (result.reason === 'locked') {
      return NextResponse.json(
        {
          error: result.lockedUntil
            ? `Too many attempts. Try again in ${Math.max(
                1,
                Math.ceil((result.lockedUntil.getTime() - Date.now()) / 60000),
              )} minutes.`
            : `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`,
        },
        { status: 429, headers: { 'Retry-After': String(LOCK_MINUTES * 60) } },
      );
    }

    return NextResponse.json(
      {
        error: `That email and password do not match. ${MAX_FAILED_LOGINS} wrong tries in a row pause sign-in.`,
      },
      { status: 401 },
    );
  }

  await setSessionCookie(result.token, result.expiresAt, request);
  // The right password starts the count again: a person who mistyped twice and
  // then got in is not one try away from a block.
  clearRateLimit('login', request);
  return NextResponse.json({ ok: true });
}
