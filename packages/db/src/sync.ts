/**
 * The sync service.
 *
 * This is the only place that writes to the database. Adapters produce
 * normalized data; the sync service turns it into rows. Imports are
 * idempotent: re-importing the same data creates no duplicates, and pending
 * transactions become posted rather than appearing twice.
 */

import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import {
  categorize,
  merchantKey,
  normalizeMerchant,
  toPlainDate,
  type CategorizationContext,
  type CategorizationOutcome,
  type DataSourceAdapter,
} from '@moneytracker/core';

import type { Database } from './client.ts';
import {
  accounts,
  balanceSnapshots,
  bankCategoryMappings,
  categories,
  categoryAssignments,
  merchants,
  transactions,
} from './schema.ts';

/** What a sync run did. */
export interface SyncResult {
  accountsUpserted: number;
  transactionsInserted: number;
  transactionsUpdated: number;
  assignmentsWritten: number;
  balancesWritten: number;
}

/** Options for a sync run. */
export interface SyncOptions {
  db: Database;
  adapter: DataSourceAdapter;
  userId: string;
  /** Only fetch transactions posted after this date. */
  since?: Date;
}

/**
 * Imports everything an adapter offers into the database.
 *
 * @example
 * const result = await syncFromAdapter({ db, adapter, userId });
 * result.transactionsInserted; // 1420 on the first run, 0 on the second
 */
export async function syncFromAdapter(options: SyncOptions): Promise<SyncResult> {
  const { db, adapter, userId, since } = options;

  const result: SyncResult = {
    accountsUpserted: 0,
    transactionsInserted: 0,
    transactionsUpdated: 0,
    assignmentsWritten: 0,
    balancesWritten: 0,
  };

  const normalizedAccounts = await adapter.fetchAccounts();
  const accountIdByExternalId = new Map<string, string>();

  for (const account of normalizedAccounts) {
    const [row] = await db
      .insert(accounts)
      .values({
        userId,
        adapterId: adapter.id,
        externalId: account.externalId,
        name: account.name,
        type: account.type,
        currency: account.currency,
        mask: account.mask ?? null,
        isLiability:
          account.isLiability ?? (account.type === 'credit_card' || account.type === 'loan'),
      })
      .onConflictDoUpdate({
        target: [accounts.userId, accounts.adapterId, accounts.externalId],
        set: {
          name: account.name,
          type: account.type,
          currency: account.currency,
          mask: account.mask ?? null,
          isLiability:
            account.isLiability ?? (account.type === 'credit_card' || account.type === 'loan'),
        },
      })
      .returning({ id: accounts.id });

    if (row) {
      accountIdByExternalId.set(account.externalId, row.id);
      result.accountsUpserted += 1;
    }
  }

  const context = await buildCategorizationContext(db, userId);

  for (const account of normalizedAccounts) {
    const accountId = accountIdByExternalId.get(account.externalId);
    if (!accountId) continue;

    const normalized = await adapter.fetchTransactions(account.externalId, since);
    const accountResult = await importTransactions(db, {
      userId,
      accountId,
      adapterId: adapter.id,
      normalized,
      context,
    });

    result.transactionsInserted += accountResult.inserted;
    result.transactionsUpdated += accountResult.updated;
    result.assignmentsWritten += accountResult.assignments;
  }

  const balances = await adapter.fetchBalances?.();
  for (const balance of balances ?? []) {
    const accountId = accountIdByExternalId.get(balance.accountExternalId);
    if (!accountId) continue;

    await db
      .insert(balanceSnapshots)
      .values({
        userId,
        accountId,
        asOf: balance.asOf,
        balanceMinor: balance.balanceMinor,
        currency: balance.currency,
      })
      .onConflictDoNothing({
        target: [balanceSnapshots.accountId, balanceSnapshots.asOf],
      });
    result.balancesWritten += 1;
  }

  return result;
}

interface ImportTransactionsOptions {
  userId: string;
  accountId: string;
  adapterId: string;
  normalized: Awaited<ReturnType<DataSourceAdapter['fetchTransactions']>>;
  context: CategorizationContext;
}

async function importTransactions(
  db: Database,
  options: ImportTransactionsOptions,
): Promise<{ inserted: number; updated: number; assignments: number }> {
  const { userId, accountId, adapterId, normalized, context } = options;

  const existingRows = await db
    .select({
      id: transactions.id,
      externalId: transactions.externalId,
      postedAt: transactions.postedAt,
      pending: transactions.pending,
      amountMinor: transactions.amountMinor,
      merchantKey: merchants.key,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(eq(transactions.accountId, accountId));

  const existingByExternalId = new Map(existingRows.map((row) => [row.externalId, row]));
  const pendingBySignature = new Map<string, (typeof existingRows)[number]>();
  for (const row of existingRows) {
    if (row.pending) {
      pendingBySignature.set(pendingSignature(row.amountMinor, row.merchantKey), row);
    }
  }

  const assignmentRows = await db
    .select({
      transactionId: categoryAssignments.transactionId,
      locked: categoryAssignments.locked,
    })
    .from(categoryAssignments)
    .innerJoin(transactions, eq(transactions.id, categoryAssignments.transactionId))
    .where(eq(transactions.accountId, accountId));

  const lockedTransactionIds = new Set(
    assignmentRows.filter((row) => row.locked).map((row) => row.transactionId),
  );

  const occurrenceCounters = new Map<string, number>();
  let inserted = 0;
  let updated = 0;
  let assignments = 0;

  for (const transaction of normalized) {
    const displayName = normalizeMerchant(transaction.descriptionRaw);
    const key = merchantKey(displayName);
    const postedDate = transaction.postedAt ? toPlainDate(transaction.postedAt) : null;
    const externalId = resolveExternalId({
      provided: transaction.externalId,
      accountId,
      postedDate,
      amountMinor: transaction.amountMinor,
      displayName,
      counters: occurrenceCounters,
    });

    const merchantId = await upsertMerchant(db, userId, key, displayName);

    let existing = existingByExternalId.get(externalId);

    // A posted transaction that matches a pending one is the same transaction.
    if (!existing && !transaction.pending) {
      const signature = pendingSignature(transaction.amountMinor, key);
      const pendingMatch = pendingBySignature.get(signature);
      if (pendingMatch && postedDate && pendingMatch.postedAt) {
        const daysApart = Math.abs(
          Date.parse(`${postedDate}T00:00:00Z`) - Date.parse(toPlainDate(pendingMatch.postedAt)),
        );
        if (daysApart <= 3 * 86_400_000) {
          existing = pendingMatch;
        }
      }
    }

    if (!existing) {
      const [row] = await db
        .insert(transactions)
        .values({
          userId,
          accountId,
          externalId,
          postedAt: transaction.postedAt,
          postedDate,
          pending: transaction.pending,
          amountMinor: transaction.amountMinor,
          currency: transaction.currency,
          descriptionRaw: transaction.descriptionRaw,
          merchantRaw: transaction.merchantRaw ?? null,
          merchantId,
          sourceCategory: transaction.sourceCategory ?? null,
          sourceAdapter: adapterId,
        })
        .returning({ id: transactions.id });

      if (row) {
        inserted += 1;
        const outcome = categorize(transaction, context);
        await writeAssignment(db, { transactionId: row.id, userId, outcome });
        assignments += 1;
      }
      continue;
    }

    const changed =
      existing.pending !== transaction.pending ||
      existing.amountMinor !== transaction.amountMinor ||
      existing.postedAt?.getTime() !== transaction.postedAt?.getTime();

    await db
      .update(transactions)
      .set({
        externalId,
        postedAt: transaction.postedAt,
        postedDate,
        pending: transaction.pending,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        descriptionRaw: transaction.descriptionRaw,
        merchantRaw: transaction.merchantRaw ?? null,
        merchantId,
        sourceCategory: transaction.sourceCategory ?? null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, existing.id));

    if (changed) updated += 1;

    // Manual edits are never overwritten.
    if (!lockedTransactionIds.has(existing.id)) {
      const outcome = categorize(transaction, context);
      await writeAssignment(db, { transactionId: existing.id, userId, outcome });
      assignments += 1;
    }
  }

  return { inserted, updated, assignments };
}

/**
 * Builds the categorization context from what the user already decided.
 *
 * Merchant memory comes from locked assignments, so a correction the user
 * made for one transaction applies to the rest of that merchant.
 */
async function buildCategorizationContext(
  db: Database,
  userId: string,
): Promise<CategorizationContext> {
  const categoryRows = await db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .where(eq(categories.userId, userId));

  const uncategorized = categoryRows.find((row) => row.slug === 'uncategorized');
  const categoryNames = new Map(categoryRows.map((row) => [row.id, row.name]));

  const mappingRows = await db
    .select({
      sourceCategory: bankCategoryMappings.sourceCategory,
      categoryId: bankCategoryMappings.categoryId,
    })
    .from(bankCategoryMappings)
    .where(eq(bankCategoryMappings.userId, userId));
  const bankCategoryMap = new Map(
    mappingRows.map((row) => [row.sourceCategory.toUpperCase(), row.categoryId]),
  );

  const memoryRows = await db
    .select({
      key: merchants.key,
      categoryId: categoryAssignments.categoryId,
      name: categories.name,
    })
    .from(categoryAssignments)
    .innerJoin(transactions, eq(transactions.id, categoryAssignments.transactionId))
    .innerJoin(merchants, eq(merchants.id, transactions.merchantId))
    .innerJoin(categories, eq(categories.id, categoryAssignments.categoryId))
    .where(and(eq(categoryAssignments.userId, userId), eq(categoryAssignments.locked, true)));

  const merchantMemory = new Map<string, { categoryId: string; displayName?: string }>();
  for (const row of memoryRows) {
    merchantMemory.set(row.key, { categoryId: row.categoryId, displayName: row.name });
  }

  return {
    rules: [],
    merchantMemory,
    bankCategoryMap,
    categoryNames,
    uncategorizedCategoryId: uncategorized?.id ?? 'uncategorized',
  };
}

async function upsertMerchant(
  db: Database,
  userId: string,
  key: string,
  displayName: string,
): Promise<string | null> {
  const [row] = await db
    .insert(merchants)
    .values({ userId, key, displayName })
    .onConflictDoUpdate({
      target: [merchants.userId, merchants.key],
      set: { displayName, lastSeenAt: new Date() },
    })
    .returning({ id: merchants.id });

  return row?.id ?? null;
}

async function writeAssignment(
  db: Database,
  options: { transactionId: string; userId: string; outcome: CategorizationOutcome },
): Promise<void> {
  const { transactionId, userId, outcome } = options;
  await db
    .insert(categoryAssignments)
    .values({
      transactionId,
      userId,
      categoryId: outcome.categoryId,
      source: outcome.source,
      confidence: outcome.confidence,
      reason: outcome.reason,
      locked: false,
    })
    .onConflictDoUpdate({
      target: categoryAssignments.transactionId,
      set: {
        categoryId: outcome.categoryId,
        source: outcome.source,
        confidence: outcome.confidence,
        reason: outcome.reason,
        updatedAt: new Date(),
      },
    });
}

/**
 * Uses the source id when it has one, otherwise derives a deterministic id
 * from the account, date, amount, normalized description and the occurrence
 * index within that day.
 */
function resolveExternalId(options: {
  provided: string;
  accountId: string;
  postedDate: string | null;
  amountMinor: number;
  displayName: string;
  counters: Map<string, number>;
}): string {
  if (options.provided) return options.provided;

  const signature = [
    options.accountId,
    options.postedDate ?? 'pending',
    options.amountMinor,
    options.displayName,
  ].join('|');
  const occurrence = options.counters.get(signature) ?? 0;
  options.counters.set(signature, occurrence + 1);

  return createHash('sha256').update(`${signature}|${occurrence}`).digest('hex').slice(0, 32);
}

function pendingSignature(amountMinor: number, merchantKey: string | null): string {
  return `${amountMinor}|${merchantKey ?? ''}`;
}
