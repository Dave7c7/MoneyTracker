/**
 * Sessions and cookies, for the server.
 *
 * The cookie holds a random token and nothing else: no email, no user id, no
 * expiry that a client could edit into something useful. What the token means
 * lives in the `sessions` table, which is why signing out actually signs out.
 *
 * This file is server only. It reads `next/headers`, which a client component
 * cannot do.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { resolveSession, type Database } from '@moneytracker/db';

import { getDatabase } from '@/lib/db.ts';

/** The name of the cookie. */
export const SESSION_COOKIE = 'mt_session';

/**
 * Whether the browser reached the app over HTTPS.
 *
 * This is asked of the request rather than of the build: a self-hosted app
 * often serves plain HTTP on a home network and HTTPS behind a proxy, from the
 * very same build. Marking the cookie secure while the page is plain HTTP
 * makes the browser throw the cookie away, and the user is signed out on every
 * request without ever seeing an error.
 *
 * @example
 * isSecureRequest(request); // false on http://192.168.1.28:3000
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0]?.trim().toLowerCase() === 'https';

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    // No address to look at: assume the safer thing.
    return process.env.NODE_ENV === 'production';
  }
}

/**
 * The user behind the session cookie, or null.
 *
 * @example
 * const userId = await getSessionUserId();
 */
export async function getSessionUserId(db?: Database): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    return await resolveSession(db ?? getDatabase().db, token);
  } catch {
    // A database that is not reachable is not a reason to crash a page: the
    // caller treats it as "not signed in".
    return null;
  }
}

/**
 * The user behind the session cookie, or a redirect to the sign-in page.
 *
 * @example
 * const userId = await requireUser();
 */
export async function requireUser(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');
  return userId;
}

/** The raw session token, for signing out. */
export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Remembers a sign-in.
 *
 * `httpOnly` keeps the token away from scripts, `sameSite: lax` lets the app
 * be linked to without letting another site post as the user, and `secure` is
 * set only when the request really arrived over HTTPS.
 *
 * @example
 * await setSessionCookie(token, expiresAt, request);
 */
export async function setSessionCookie(
  token: string,
  expiresAt: Date,
  request: Request,
): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    expires: expiresAt,
  });
}

/** Forgets the session cookie. */
export async function clearSessionCookie(request: Request): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: 0,
  });
}
