import { NextResponse } from 'next/server';

import { getImportProfile, runImport } from '@moneytracker/db';

import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';
import { readUpload } from '@/lib/import-upload.ts';

/**
 * Imports a file.
 *
 * The rows are written the way a bank connection writes them, so the rules,
 * the merchant memory and the transfer detection all apply.
 */
export async function POST(request: Request) {
  const upload = await readUpload(request);
  if (!upload.ok) return upload.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const profile = await getImportProfile(db, userId, upload.data.profileId);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const result = await runImport(db, userId, {
    profile,
    content: upload.data.file.content,
  });

  return NextResponse.json({ result });
}
