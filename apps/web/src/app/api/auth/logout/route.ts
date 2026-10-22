import { NextResponse } from 'next/server';

import { signOut } from '@moneytracker/db';

import { clearSessionCookie, getSessionToken } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * Signs out.
 *
 * The session row is removed as well as the cookie, so a copied cookie stops
 * working the moment the user signs out.
 */
export async function POST(request: Request) {
  const token = await getSessionToken();
  if (token) {
    const { db } = getDatabase();
    await signOut(db, token);
  }

  await clearSessionCookie(request);
  return NextResponse.json({ ok: true });
}
