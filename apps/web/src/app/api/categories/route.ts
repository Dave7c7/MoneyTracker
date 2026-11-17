import { NextResponse } from 'next/server';

import { CategoryError, createCategory, listCategoriesWithUsage } from '@moneytracker/db';

import { categoryBodySchema, readJson } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/** The user's categories, with how many transactions, rules and budgets use each. */
export async function GET() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const categories = await listCategoriesWithUsage(db, userId);
  return NextResponse.json({ categories });
}

/** Creates a category of the user's own. */
export async function POST(request: Request) {
  const body = await readJson(request, categoryBodySchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  try {
    const category = await createCategory(db, userId, body.data);
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof CategoryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
