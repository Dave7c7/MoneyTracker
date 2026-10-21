/**
 * The categorization state.
 *
 * Loading the rules, the categories, the bank-category mapping and the
 * transactions is needed in two places: the sync service, and the service
 * that re-categorizes when a rule changes. Both need exactly the same
 * picture, so it is loaded once, here.
 */

import { and, eq } from 'drizzle-orm';

import type { CategorizableTransaction, CategorizationContext, Rule } from '@moneytracker/core';

import type { Database } from './client.ts';
import {
  bankCategoryMappings,
  categories,
  categoryAssignments,
  merchants,
  rules as rulesTable,
  transactions as transactionsTable,
} from './schema.ts';

/** A rule as it is stored. */
export type RuleRow = typeof rulesTable.$inferSelect;

/** Everything the pipeline needs to make a decision. */
export interface CategorizationState {
  context: CategorizationContext;
  transactions: CategorizableTransaction[];
  rules: Rule[];
}

/**
 * Converts a stored rule into the shape the core pipeline uses.
 *
 * @example
 * toCoreRule(row); // { id, name, priority, ... }
 */
export function toCoreRule(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    enabled: row.enabled,
    matchMerchant: row.matchMerchant,
    matchDescriptionPattern: row.matchDescriptionPattern,
    minAmountMinor: row.minAmountMinor,
    maxAmountMinor: row.maxAmountMinor,
    accountId: row.accountId,
    categoryId: row.categoryId,
  };
}

/**
 * Loads the rules, the categories and every transaction with its assignment.
 *
 * @example
 * const state = await loadCategorizationState(db, userId);
 * state.transactions.length; // 851
 */
export async function loadCategorizationState(
  db: Database,
  userId: string,
): Promise<CategorizationState> {
  const [categoryRows, mappingRows, ruleRows, transactionRows] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, slug: categories.slug })
      .from(categories)
      .where(eq(categories.userId, userId)),
    db
      .select({
        sourceCategory: bankCategoryMappings.sourceCategory,
        categoryId: bankCategoryMappings.categoryId,
      })
      .from(bankCategoryMappings)
      .where(eq(bankCategoryMappings.userId, userId)),
    db.select().from(rulesTable).where(eq(rulesTable.userId, userId)),
    db
      .select({
        id: transactionsTable.id,
        externalId: transactionsTable.externalId,
        accountId: transactionsTable.accountId,
        amountMinor: transactionsTable.amountMinor,
        currency: transactionsTable.currency,
        descriptionRaw: transactionsTable.descriptionRaw,
        merchantDisplayName: merchants.displayName,
        sourceCategory: transactionsTable.sourceCategory,
        postedAt: transactionsTable.postedAt,
        pending: transactionsTable.pending,
        categoryId: categoryAssignments.categoryId,
        assignmentSource: categoryAssignments.source,
        confidence: categoryAssignments.confidence,
        reason: categoryAssignments.reason,
        locked: categoryAssignments.locked,
      })
      .from(transactionsTable)
      .leftJoin(merchants, eq(merchants.id, transactionsTable.merchantId))
      .leftJoin(categoryAssignments, eq(categoryAssignments.transactionId, transactionsTable.id))
      .where(eq(transactionsTable.userId, userId)),
  ]);

  const uncategorized = categoryRows.find((row) => row.slug === 'uncategorized');
  const categoryNames = new Map(categoryRows.map((row) => [row.id, row.name]));
  const bankCategoryMap = new Map(
    mappingRows.map((row) => [row.sourceCategory.toUpperCase(), row.categoryId]),
  );

  // Merchant memory: what the user chose for this merchant by hand.
  const memoryRows = await db
    .select({
      key: merchants.key,
      categoryId: categoryAssignments.categoryId,
      name: categories.name,
    })
    .from(categoryAssignments)
    .innerJoin(transactionsTable, eq(transactionsTable.id, categoryAssignments.transactionId))
    .innerJoin(merchants, eq(merchants.id, transactionsTable.merchantId))
    .innerJoin(categories, eq(categories.id, categoryAssignments.categoryId))
    .where(and(eq(categoryAssignments.userId, userId), eq(categoryAssignments.locked, true)));

  const merchantMemory = new Map<string, { categoryId: string; displayName?: string }>();
  for (const row of memoryRows) {
    if (!merchantMemory.has(row.key)) {
      merchantMemory.set(row.key, { categoryId: row.categoryId, displayName: row.name });
    }
  }

  const rules = ruleRows
    .map(toCoreRule)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  const context: CategorizationContext = {
    rules,
    merchantMemory,
    bankCategoryMap,
    categoryNames,
    uncategorizedCategoryId: uncategorized?.id ?? 'uncategorized',
  };

  const categorizable: CategorizableTransaction[] = transactionRows.map((row) => ({
    id: row.id,
    externalId: row.externalId,
    accountId: row.accountId,
    amountMinor: row.amountMinor,
    currency: row.currency,
    descriptionRaw: row.descriptionRaw,
    merchantDisplayName: row.merchantDisplayName,
    sourceCategory: row.sourceCategory,
    postedAt: row.postedAt,
    pending: row.pending,
    currentAssignment: row.categoryId
      ? {
          categoryId: row.categoryId,
          source: row.assignmentSource ?? 'fallback',
          confidence: row.confidence ?? 0,
          reason: row.reason ?? '',
          locked: row.locked ?? false,
        }
      : null,
  }));

  return { context, transactions: categorizable, rules };
}
