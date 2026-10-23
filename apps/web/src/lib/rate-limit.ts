/**
 * Rate limits for the routes that check a password.
 *
 * The account lockout already pauses a run of wrong passwords. This is the
 * other half: one address cannot spend the machine's time hashing guesses, and
 * cannot walk a short list of common passwords quickly.
 *
 * ## The address
 *
 * `x-forwarded-for` is what a route handler can see, and Next.js fills it from
 * the socket when the client did not send it. Behind a reverse proxy that sets
 * the header, the first entry is the client and the limit follows the real
 * address. On a directly exposed server a client can write its own value and
 * dodge the limit; that is why the lockout on the account, not this, is the
 * defence that matters. See `docs/DECISIONS.md`.
 *
 * ## The counters
 *
 * They live in this process, in memory. A restart forgets them, which is a
 * fine price for not needing a table: a single-user app runs one process, and
 * the lockout is the durable one.
 */

import 'server-only';

import { NextResponse } from 'next/server';

import { createRateLimiter } from '@moneytracker/core';

/**
 * One limiter per route, because they are worth different patience.
 *
 * Sign in is the loosest: a household mistypes, and a locked account is the
 * stronger guard anyway. Setting the first password is the tightest: nothing
 * legitimate needs to try it six times.
 */
const limits = {
  login: createRateLimiter({ limit: 20, windowMs: 5 * 60_000 }),
  setup: createRateLimiter({ limit: 5, windowMs: 15 * 60_000 }),
  password: createRateLimiter({ limit: 10, windowMs: 15 * 60_000 }),
  email: createRateLimiter({ limit: 10, windowMs: 15 * 60_000 }),
} as const;

/** The routes that have a limit. */
export type LimitedAction = keyof typeof limits;

/**
 * The address behind a request, as far as the app can tell.
 *
 * @example
 * clientAddress(request); // '203.0.113.9'
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : 'unknown';
}

/**
 * Counts a request, or says that the address has had enough.
 *
 * @example
 * const limited = checkRateLimit('login', request);
 * if (limited) return limited;
 */
export function checkRateLimit(action: LimitedAction, request: Request): NextResponse | null {
  const result = limits[action].check(clientAddress(request));
  if (result.allowed) return null;

  const minutes = Math.max(1, Math.ceil(result.retryAfterMs / 60_000));
  return NextResponse.json(
    {
      error:
        `Too many tries from this address. Try again in ${minutes} ` +
        `${minutes === 1 ? 'minute' : 'minutes'}.`,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) },
    },
  );
}

/**
 * Forgets an address's count, so a success starts from zero.
 *
 * @example
 * clearRateLimit('login', request); // after the password was right
 */
export function clearRateLimit(action: LimitedAction, request: Request): void {
  limits[action].reset(clientAddress(request));
}
