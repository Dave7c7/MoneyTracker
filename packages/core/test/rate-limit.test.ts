import { describe, expect, it } from 'vitest';

import { createRateLimiter } from '../src/rate-limit.ts';

/**
 * The limiter counts requests per key inside a moving window. The clock is
 * passed in, so the tests do not wait.
 */
const POLICY = { limit: 3, windowMs: 60_000 };
const START = Date.UTC(2026, 9, 22, 12, 0, 0);

describe('the rate limiter', () => {
  it('allows the limit, then blocks', () => {
    const limiter = createRateLimiter(POLICY);

    expect(limiter.check('a', START)).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
    expect(limiter.check('a', START + 1).allowed).toBe(true);
    expect(limiter.check('a', START + 2).allowed).toBe(true);

    const blocked = limiter.check('a', START + 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('counts each address on its own', () => {
    const limiter = createRateLimiter(POLICY);

    for (let i = 0; i < 3; i += 1) limiter.check('a', START + i);

    expect(limiter.check('a', START + 3).allowed).toBe(false);
    // The neighbour is unaffected: one noisy address is not an outage.
    expect(limiter.check('b', START + 3).allowed).toBe(true);
  });

  it('lifts the block when the window has passed, and says when', () => {
    const limiter = createRateLimiter(POLICY);

    for (let i = 0; i < 3; i += 1) limiter.check('a', START + i);

    const blocked = limiter.check('a', START + 10_000);
    expect(blocked.allowed).toBe(false);
    // The oldest request was at START, so the wait is one window from it.
    expect(blocked.retryAfterMs).toBe(50_000);

    expect(limiter.check('a', START + 60_000).allowed).toBe(true);
  });

  it('does not let a blocked request extend its own block', () => {
    const limiter = createRateLimiter(POLICY);

    for (let i = 0; i < 3; i += 1) limiter.check('a', START);

    // A script that keeps knocking does not push the door further away.
    limiter.check('a', START + 30_000);
    limiter.check('a', START + 40_000);

    expect(limiter.check('a', START + 60_000).allowed).toBe(true);
  });

  it('starts the count again after a success', () => {
    const limiter = createRateLimiter(POLICY);

    limiter.check('a', START);
    limiter.check('a', START + 1);
    limiter.reset('a');

    const after = limiter.check('a', START + 2);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(2);
  });

  it('drops the least recently seen address when it is full', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 }, { maxKeys: 2 });

    limiter.check('old', START);
    limiter.check('kept', START + 1);
    limiter.check('new', START + 2);

    expect(limiter.size()).toBe(2);

    // 'old' was forgotten to make room, so it starts over rather than being
    // locked out for a window it never spent.
    const old = limiter.check('old', START + 3);
    expect(old.allowed).toBe(true);
    expect(old.remaining).toBe(1);
  });

  it('never grows past its key ceiling, even when nothing has expired', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 }, { maxKeys: 2 });

    limiter.check('a', START);
    limiter.check('b', START + 1);
    limiter.check('c', START + 2);

    expect(limiter.size()).toBe(2);
  });

  it('refuses a policy that would allow nothing, or forever', () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1_000 })).toThrow();
    expect(() => createRateLimiter({ limit: 1.5, windowMs: 1_000 })).toThrow();
    expect(() => createRateLimiter({ limit: 1, windowMs: 0 })).toThrow();
  });
});
