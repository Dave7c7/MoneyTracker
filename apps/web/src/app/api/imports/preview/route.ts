import { NextResponse } from 'next/server';

import { getImportProfile, previewImport } from '@moneytracker/db';

import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';
import { readUpload } from '@/lib/import-upload.ts';

/**
 * Shows what a file would do, without doing it.
 *
 * The preview is the promise the import keeps: the same file and the same
 * profile give the same numbers here and there.
 */
export async function POST(request: Request) {
  const upload = await readUpload(request);
  if (!upload.ok) return upload.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const profile = await getImportProfile(db, userId, upload.data.profileId);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const preview = await previewImport(db, userId, {
    profile,
    content: upload.data.file.content,
    fileName: upload.data.file.fileName,
  });

  return NextResponse.json({ preview });
}
