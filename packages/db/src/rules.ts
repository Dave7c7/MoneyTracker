/**
 * The rules service.
 *
 * Rules are the user's own categorization rules. Creating or changing one
 * re-categorizes the transactions it can reach, and the UI is told how many
 * changed. Manual edits are never overwritten.
 */

import { and, asc, eq } from 'drizzle-orm';

import {
  matchInputFor,
  planRecategorization,
  previewRule,
  ruleMatches,
  type CategorizationContext,
  type Rule,
  type RulePreview,
} from '@moneytracker/core';

import { loadCategorizationState, toCoreRule, type RuleRow } from './categorization-state.ts';
import type { Database } from './client.ts';
import { categoryAssignments, rules as rulesTable } from './schema.ts';

/** The fields a rule is made of. */
export interface RuleInput {
  name: string;
  categoryId: string;
  priority?: number;
  enabled?: boolean;
  matchMerchant?: string | null;
  matchDescriptionPattern?: string | null;
  minAmountMinor?: number | null;
  maxAmountMinor?: number | null;
  accountId?: string | null;
}

/** A rule with the number of transactions it currently reaches. */
export interface RuleWithCount extends Rule {
  /** Transactions the rule matches today. */
  matchedCount: number;
}

/** What a re-categorization run did. */
export interface ApplyResult {
  /** Transactions that were looked at. */
  scanned: number;
  /** Assignments that changed. */
  changed: number;
  /** Manual edits that were left alone. */
  skipped: number;
}

/**
 * Lists the user's rules, in priority order.
 *
 * @example
 * const rules = await listRules(db, userId);
 */
export async function listRules(db: Database, userId: string): Promise<RuleWithCount[]> {
  const rows = await db
    .select()
    .from(rulesTable)
    .where(eq(rulesTable.userId, userId))
    .orderBy(asc(rulesTable.priority), asc(rulesTable.createdAt));

  const state = await loadCategorizationState(db, userId);

  return rows.map((row) => {
    const rule = toCoreRule(row);
    return {
      ...rule,
      matchedCount: state.transactions.filter((transaction) =>
        ruleMatches(rule, matchInputFor(transaction)),
      ).length,
    };
  });
}

/**
 * Creates a rule.
 *
 * @example
 * const rule = await createRule(db, userId, { name: 'Shell → Gas', categoryId, matchMerchant: 'shell' });
 */
export async function createRule(db: Database, userId: string, input: RuleInput): Promise<RuleRow> {
  const [row] = await db
    .insert(rulesTable)
    .values({
      userId,
      name: input.name,
      categoryId: input.categoryId,
      priority: input.priority ?? 100,
      enabled: input.enabled ?? true,
      matchMerchant: input.matchMerchant ?? null,
      matchDescriptionPattern: input.matchDescriptionPattern ?? null,
      minAmountMinor: input.minAmountMinor ?? null,
      maxAmountMinor: input.maxAmountMinor ?? null,
      accountId: input.accountId ?? null,
    })
    .returning();

  if (!row) throw new Error('Could not create the rule');
  return row;
}

/**
 * Updates a rule. Returns null when the rule does not exist.
 *
 * @example
 * await updateRule(db, userId, ruleId, { priority: 5 });
 */
export async function updateRule(
  db: Database,
  userId: string,
  ruleId: string,
  input: Partial<RuleInput>,
): Promise<RuleRow | null> {
  const [row] = await db
    .update(rulesTable)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.matchMerchant !== undefined ? { matchMerchant: input.matchMerchant } : {}),
      ...(input.matchDescriptionPattern !== undefined
        ? { matchDescriptionPattern: input.matchDescriptionPattern }
        : {}),
      ...(input.minAmountMinor !== undefined ? { minAmountMinor: input.minAmountMinor } : {}),
      ...(input.maxAmountMinor !== undefined ? { maxAmountMinor: input.maxAmountMinor } : {}),
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(rulesTable.id, ruleId), eq(rulesTable.userId, userId)))
    .returning();

  return row ?? null;
}

/**
 * Deletes a rule. Returns whether a rule was actually removed.
 *
 * @example
 * await deleteRule(db, userId, ruleId);
 */
export async function deleteRule(db: Database, userId: string, ruleId: string): Promise<boolean> {
  const rows = await db
    .delete(rulesTable)
    .where(and(eq(rulesTable.id, ruleId), eq(rulesTable.userId, userId)))
    .returning({ id: rulesTable.id });

  return rows.length > 0;
}

/**
 * Sets the priority of several rules at once, in the given order.
 *
 * @example
 * await reorderRules(db, userId, [second.id, first.id]);
 */
export async function reorderRules(
  db: Database,
  userId: string,
  orderedIds: readonly string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(rulesTable)
        .set({ priority: (index + 1) * 10, updatedAt: new Date() })
        .where(and(eq(rulesTable.id, id), eq(rulesTable.userId, userId)));
    }
  });
}

/**
 * Shows what a rule would do to the existing data, before it is saved.
 *
 * @example
 * await previewRuleChange(db, userId, { ...rule, id: 'new' });
 * // { matched: 34, wouldChange: 12, locked: 3 }
 */
export async function previewRuleChange(
  db: Database,
  userId: string,
  rule: Rule,
): Promise<RulePreview> {
  const state = await loadCategorizationState(db, userId);

  // The preview has to judge the rule as it would be *after* saving, so the
  // rule takes part in the plan.
  const context: CategorizationContext = {
    ...state.context,
    rules: [...(state.context.rules ?? []).filter((existing) => existing.id !== rule.id), rule],
  };

  return previewRule(rule, state.transactions, context);
}

/**
 * Categorizes every unlocked transaction again.
 *
 * Called after a rule is created, changed or deleted. Manual edits are left
 * alone, and only the assignments that actually change are written.
 *
 * @example
 * const result = await applyRules(db, userId);
 * result.changed; // 12
 */
export async function applyRules(db: Database, userId: string): Promise<ApplyResult> {
  const state = await loadCategorizationState(db, userId);
  const changes = planRecategorization(state.transactions, state.context);
  const skipped = state.transactions.filter(
    (transaction) => transaction.currentAssignment?.locked,
  ).length;

  if (changes.length > 0) {
    await db.transaction(async (tx) => {
      for (const change of changes) {
        await tx
          .insert(categoryAssignments)
          .values({
            transactionId: change.transactionId,
            userId,
            categoryId: change.next.categoryId,
            source: change.next.source,
            confidence: change.next.confidence,
            reason: change.next.reason,
            locked: false,
          })
          .onConflictDoUpdate({
            target: categoryAssignments.transactionId,
            set: {
              categoryId: change.next.categoryId,
              source: change.next.source,
              confidence: change.next.confidence,
              reason: change.next.reason,
              updatedAt: new Date(),
            },
          });
      }
    });
  }

  return { scanned: state.transactions.length, changed: changes.length, skipped };
}
