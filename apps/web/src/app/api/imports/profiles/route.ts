import { NextResponse } from 'next/server';

import { createImportProfile, listImportProfiles } from '@moneytracker/db';

import { readJson } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';
import { importProfileSchema } from '@/lib/imports.ts';

/**
 * The import profiles of the user.
 *
 * A profile is how the user describes one institution's export: the columns,
 * the formats and the account the rows belong to.
 */
export async function GET() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const profiles = await listImportProfiles(db, userId);

  return NextResponse.json({
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      institution: profile.institution,
      mapping: profile.mapping,
      accountName: profile.accountName,
      accountType: profile.accountType,
      currency: profile.currency,
    })),
  });
}

/** Saves a new import profile. */
export async function POST(request: Request) {
  const body = await readJson(request, importProfileSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const profile = await createImportProfile(db, userId, {
    name: body.data.name,
    institution: body.data.institution ?? null,
    mapping: body.data.mapping,
    accountName: body.data.accountName,
    accountType: body.data.accountType,
    currency: body.data.currency,
  });

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
