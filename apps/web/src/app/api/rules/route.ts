import { NextResponse } from 'next/server';

import { applyRules, createRule, listRules, previewRuleChange } from '@moneytracker/db';

import { readJson, ruleBodySchema, rulePreviewSchema } from '@/lib/api.ts';
import { getDatabase } from '@/lib/db.ts';
import { getUserId } from '@/lib/data.ts';

/**
 * The user's categorization rules.
 *
 * Creating a rule re-categorizes the transactions it can reach, so the
 * response says how many changed.
 */
export async function GET() {
  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const rules = await listRules(db, userId);
  return NextResponse.json({ rules });
}

/** Creates a rule and applies it to the existing transactions. */
export async function POST(request: Request) {
  const body = await readJson(request, ruleBodySchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const rule = await createRule(db, userId, body.data);
  const applied = await applyRules(db, userId);

  return NextResponse.json({ rule, applied }, { status: 201 });
}

/**
 * Shows what a rule would do before it is saved.
 *
 * The body is the same as for creating a rule, so the form can preview
 * exactly what it is about to create.
 */
export async function PUT(request: Request) {
  const body = await readJson(request, rulePreviewSchema);
  if (!body.ok) return body.response;

  const { db } = getDatabase();
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'No user configured' }, { status: 503 });

  const preview = await previewRuleChange(db, userId, {
    id: 'preview',
    name: body.data.name ?? 'Preview',
    priority: body.data.priority ?? 100,
    enabled: body.data.enabled ?? true,
    matchMerchant: body.data.matchMerchant ?? null,
    matchDescriptionPattern: body.data.matchDescriptionPattern ?? null,
    minAmountMinor: body.data.minAmountMinor ?? null,
    maxAmountMinor: body.data.maxAmountMinor ?? null,
    accountId: body.data.accountId ?? null,
    categoryId: body.data.categoryId ?? '',
  });

  return NextResponse.json({ preview });
}
