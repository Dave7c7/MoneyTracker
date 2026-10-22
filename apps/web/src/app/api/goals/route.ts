import { NextResponse } from 'next/server';

import { toPlainDate } from '@moneytracker/core';
import { createSavingsGoal, listSavingsGoals } from '@moneytracker/db';

import { goalBodySchema, readJson } from '@/lib/api.ts';
import { getUserId, toGoalView } from '@/lib/data.ts';
import { getDatabase } from '@/lib/db.ts';

/**
 * The savings goals of the user.
 *
 * The goals come back in the same shape the screen shows, so a screen that
 * reloads looks the same as the one the server rendered.
 */
export async function GET() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const goals = await listSavingsGoals(db, userId);
  const today = toPlainDate(new Date());
  return NextResponse.json({ goals: goals.map((goal) => toGoalView(goal, today)) });
}

/**
 * Adds a goal.
 *
 * The app never moves money: a goal is a target the user is keeping track of.
 */
export async function POST(request: Request) {
  const body = await readJson(request, goalBodySchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const goal = await createSavingsGoal(db, userId, body.data);
  return NextResponse.json({ goal }, { status: 201 });
}
