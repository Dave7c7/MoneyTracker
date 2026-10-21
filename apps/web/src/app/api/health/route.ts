import { NextResponse } from 'next/server';

import { getDatabase } from '@/lib/db.ts';
import { getEnv } from '@/lib/env.ts';

/**
 * A health check for the container platform.
 *
 * It reports whether the app can reach the database, without leaking any
 * connection details.
 */
export async function GET() {
  try {
    const { db } = getDatabase();
    await db.execute('select 1');
    return NextResponse.json({
      status: 'ok',
      database: 'reachable',
      timezone: getEnv().APP_TIMEZONE,
    });
  } catch {
    return NextResponse.json({ status: 'error', database: 'unreachable' }, { status: 503 });
  }
}
