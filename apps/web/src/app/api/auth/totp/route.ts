import { NextResponse } from 'next/server';

import {
  confirmTwoFactor,
  disableTwoFactor,
  startTwoFactor,
  verifyCurrentPassword,
} from '@moneytracker/db';

import { twoFactorSchema } from '@/lib/api.ts';
import { readJson } from '@/lib/api.ts';
import { getSessionUserId } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';
import { checkRateLimit } from '@/lib/rate-limit.ts';

/**
 * Two-factor sign-in: start, confirm, or turn off.
 *
 * One route with three actions, because they share every guard: a session, a
 * rate limit, and — for the two that change the account — the current
 * password. Turning it on happens in two steps: `start` makes a secret the
 * authenticator can scan, and `confirm` proves a code from it before the account
 * actually asks for one.
 */
export async function POST(request: Request) {
  const limited = checkRateLimit('totp', request);
  if (limited) return limited;

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const body = await readJson(request, twoFactorSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const encryptionKey = getEnv().ENCRYPTION_KEY;

  if (body.data.action === 'start') {
    if (!(await verifyCurrentPassword(db, userId, body.data.currentPassword))) {
      return NextResponse.json({ error: 'That password is not right.' }, { status: 403 });
    }

    const started = await startTwoFactor(db, userId, encryptionKey);
    if (!started.ok) return NextResponse.json({ error: started.error }, { status: 400 });

    // The secret is only returned here, once, to be scanned or typed.
    return NextResponse.json({ secret: started.secret, uri: started.uri });
  }

  if (body.data.action === 'confirm') {
    const confirmed = await confirmTwoFactor(db, userId, encryptionKey, body.data.code);
    if (!confirmed.ok) return NextResponse.json({ error: confirmed.error }, { status: 400 });

    // Shown once, and never again: only the hashes are kept.
    return NextResponse.json({ recoveryCodes: confirmed.recoveryCodes });
  }

  if (!(await verifyCurrentPassword(db, userId, body.data.currentPassword))) {
    return NextResponse.json({ error: 'That password is not right.' }, { status: 403 });
  }

  await disableTwoFactor(db, userId);
  return NextResponse.json({ ok: true });
}
