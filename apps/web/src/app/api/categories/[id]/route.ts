import { NextResponse } from 'next/server';

import { applyRules, CategoryError, deleteCategory, updateCategory } from '@moneytracker/db';

import { categoryDeleteSchema, categoryUpdateSchema, readJson } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

function refused(error: unknown) {
  if (error instanceof CategoryError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

/** Renames, recolours or moves a category. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await readJson(request, categoryUpdateSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  try {
    const category = await updateCategory(db, userId, id, body.data);
    return NextResponse.json({ category });
  } catch (error) {
    return refused(error);
  }
}

/**
 * Deletes a category the user made. Its transactions move to the category in
 * the body (Uncategorized by default), then the pipeline runs again so the
 * moved transactions that are not locked get a fresh suggestion.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const text = await request.text();
  const parsed = categoryDeleteSchema.safeParse(text ? safeJson(text) : {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  try {
    const result = await deleteCategory(db, userId, id, {
      moveToCategoryId: parsed.data.moveToCategoryId ?? null,
    });
    const applied = await applyRules(db, userId);
    return NextResponse.json({ deleted: true, ...result, applied });
  } catch (error) {
    return refused(error);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
