import { NextResponse } from 'next/server';

import { deleteBudget, setBudget } from '@moneytracker/db';

import { budgetBodySchema, readJson } from '@/lib/api.ts';
import { getBudgetsData, getUserId } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * The budgets of the user, with what was spent against them.
 */
export async function GET() {
  const data = await getBudgetsData();
  if (!data) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  return NextResponse.json({ budgets: data.budgets, status: data.status });
}

/**
 * Sets the budget for a category.
 *
 * A category has one budget: setting it again changes it.
 */
export async function POST(request: Request) {
  const body = await readJson(request, budgetBodySchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const budget = await setBudget(db, userId, body.data);
  if (!budget) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

  return NextResponse.json({ budget }, { status: 201 });
}

/** Removes a budget. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'A budget id is needed' }, { status: 400 });

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const deleted = await deleteBudget(db, userId, id);
  if (!deleted) return NextResponse.json({ error: 'Budget not found' }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
