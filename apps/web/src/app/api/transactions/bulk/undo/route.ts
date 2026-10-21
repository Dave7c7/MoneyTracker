import { NextResponse } from 'next/server';

import { undoBulkSetCategory } from '@moneytracker/db';
import { z } from 'zod';

import { readJson } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/** The body of an undo: the assignments as they were before the edit. */
const undoSchema = z.object({
  previous: z
    .array(
      z.object({
        transactionId: z.string().uuid(),
        assignment: z
          .object({
            categoryId: z.string().uuid(),
            source: z.enum([
              'user_manual',
              'user_rule',
              'merchant_memory',
              'bank',
              'ai',
              'fallback',
            ]),
            confidence: z.number(),
            reason: z.string(),
            locked: z.boolean(),
          })
          .nullable(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * Puts a bulk edit back the way it was, source and lock included.
 */
export async function POST(request: Request) {
  const body = await readJson(request, undoSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const restored = await undoBulkSetCategory(db, userId, body.data.previous);

  return NextResponse.json({ restored });
}
