import { NextResponse } from 'next/server';

import { deleteImportProfile, updateImportProfile } from '@moneytracker/db';

import { readJson } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';
import { importProfileUpdateSchema } from '@/lib/imports.ts';

/** Changes an import profile. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, importProfileUpdateSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const profile = await updateImportProfile(db, userId, id, body.data);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  return NextResponse.json({
    profile: {
      id: profile.id,
      name: profile.name,
      institution: profile.institution,
      mapping: profile.mapping,
      accountName: profile.accountName,
      accountType: profile.accountType,
      currency: profile.currency,
    },
  });
}

/** Deletes an import profile. The transactions it imported stay. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const deleted = await deleteImportProfile(db, userId, id);
  if (!deleted) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
