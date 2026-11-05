import { NextResponse, type NextRequest } from 'next/server';

/**
 * The gate.
 *
 * This only looks for the session cookie: it runs on every request, including
 * the ones for the service worker and the static files, so it must stay cheap.
 * What the cookie *means* is decided in the database, by the pages and the API
 * routes themselves; this is the first line, not the last.
 *
 * For that reason it does not send a signed-in-looking request away from the
 * sign-in page. A cookie can be stale — a restored database, a wiped sessions
 * table — and redirecting on its presence alone would bounce `/login` to `/overview`
 * and `/overview` back to `/login` until the browser gave up. The sign-in page checks
 * the session for real and sends a live one to the money.
 */

/** The cookie the session lives in. Keep in step with `lib/auth.ts`. */
const SESSION_COOKIE = 'mt_session';

/** Paths that must work without a session. */
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/api/auth/login',
  '/api/auth/setup',
  '/api/health',
  '/manifest.webmanifest',
  '/sw.js',
  '/icons',
  '/images',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token || isPublic(pathname)) return NextResponse.next();

  // An API call gets an answer it can read, not a page of HTML.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }

  const signIn = new URL('/login', request.url);
  if (pathname !== '/') signIn.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  /*
    Everything except the Next.js internals and the files the browser asks for
    before it renders anything. `api/health` stays public for the container's
    health check.
  */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
