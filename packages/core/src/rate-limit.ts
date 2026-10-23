/**
 * A sliding-window rate limiter.
 *
 * Sign-in has two costs worth guarding. One is the password: guessing it should
 * take time, and it does — but every guess also costs the server a scrypt hash.
 * The other is a script that simply hammers the endpoint.
 *
 * The account lockout in `packages/db/src/auth.ts` answers the first: five
 * wrong passwords pause that account. This answers the second, per address, so
 * one noisy client cannot spend the machine's time and cannot try a short list
 * of passwords quickly.
 *
 * It is deliberately in memory and deliberately small. A single-user app runs
 * in one process; a restart clearing the counters is not a hole worth a table
 * and a migration.
 */

/** How many requests are allowed, and over what stretch of time. */
export interface RateLimitPolicy {
  /** Requests allowed in the window. */
  limit: number;
  /** The length of the window in milliseconds. */
  windowMs: number;
}

/** What a check says. */
export interface RateLimitResult {
  /** Whether this request may go ahead. */
  allowed: boolean;
  /** Requests left in the window after this one, zero when blocked. */
  remaining: number;
  /** How long until the block lifts; zero when allowed. */
  retryAfterMs: number;
}

/** A limiter for one kind of request. */
export interface RateLimiter {
  /**
   * Records a request and says whether it is allowed.
   *
   * A blocked request is not recorded: otherwise a busy attacker would keep
   * their own block alive, and a client that gave up would take longer to get
   * back in than the window says.
   *
   * @example
   * limiter.check('203.0.113.9', Date.now());
   */
  check(key: string, now?: number): RateLimitResult;
  /** Forgets one key, so a success can start the count again. */
  reset(key: string): void;
  /** How many keys are being remembered. */
  size(): number;
}

/** Options that are not part of the policy. */
export interface RateLimiterOptions {
  /**
   * The most keys to remember at once.
   *
   * Keys are addresses, and an attacker can invent them, so the map needs a
   * ceiling: past it, the least recently seen keys are dropped. Ten thousand is
   * far more than a home network ever produces.
   */
  maxKeys?: number;
}

/**
 * Creates a limiter that allows `limit` requests per key in any `windowMs`.
 *
 * @example
 * const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
 * limiter.check('a').allowed; // true
 */
export function createRateLimiter(
  policy: RateLimitPolicy,
  options: RateLimiterOptions = {},
): RateLimiter {
  if (!Number.isInteger(policy.limit) || policy.limit < 1) {
    throw new Error('A rate limit needs a whole number of requests, at least 1.');
  }
  if (!(policy.windowMs > 0)) {
    throw new Error('A rate limit needs a window longer than zero.');
  }

  const maxKeys = options.maxKeys ?? 10_000;
  /** The times of the recent requests, per key, oldest first. */
  const hits = new Map<string, number[]>();

  function check(key: string, now: number = Date.now()): RateLimitResult {
    const since = now - policy.windowMs;
    const recent = (hits.get(key) ?? []).filter((time) => time > since);

    if (recent.length >= policy.limit) {
      // Keep the trimmed list: the window has already moved on.
      hits.set(key, recent);
      const oldest = recent[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, oldest + policy.windowMs - now),
      };
    }

    recent.push(now);
    hits.set(key, recent);
    if (hits.size > maxKeys) forget(now);

    return { allowed: true, remaining: policy.limit - recent.length, retryAfterMs: 0 };
  }

  function reset(key: string): void {
    hits.delete(key);
  }

  function size(): number {
    return hits.size;
  }

  /** Drops what has expired, then the least recently seen keys, until it fits. */
  function forget(now: number): void {
    const since = now - policy.windowMs;
    for (const [key, times] of hits) {
      const last = times[times.length - 1];
      if (last === undefined || last <= since) hits.delete(key);
    }

    while (hits.size > maxKeys) {
      const oldest = hits.keys().next();
      if (oldest.done) return;
      hits.delete(oldest.value);
    }
  }

  return { check, reset, size };
}
