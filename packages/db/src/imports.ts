/**
 * The import service.
 *
 * A file export is imported the same way a bank connection is: the adapter
 * reads the file, the sync service writes the rows. This service sits in
 * between and answers two questions: what would this file do, and do it.
 *
 * The profile comes first, because the ids of the rows are derived from it.
 * A preview and an import of the same file therefore always agree.
 */

import { createHash, randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { CsvAdapter, readCsvFile } from '@moneytracker/adapters';
import type { AccountType, CsvMapping } from '@moneytracker/core';

import type { Database } from './client.ts';
import { accounts, importProfiles, transactions } from './schema.ts';
import { syncFromAdapter } from './sync.ts';

/** A saved way of reading one institution's export. */
export interface ImportProfile {
  id: string;
  name: string;
  institution: string | null;
  mapping: CsvMapping;
  accountKey: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What a profile is made of. */
export interface ImportProfileInput {
  name: string;
  institution?: string | null;
  mapping: CsvMapping;
  accountName: string;
  accountType: AccountType;
  currency: string;
}

/** An account the file belongs to, and whether it is already in the app. */
export interface ImportAccountPreview {
  externalId: string;
  name: string;
  type: AccountType;
  currency: string;
  /** True when the account already exists and holds transactions. */
  exists: boolean;
  /** How many rows of the file belong to this account. */
  rowCount: number;
}

/** What a file would do, before it does anything. */
export interface ImportPreview {
  fileName: string;
  /** Rows the file holds that the app can read. */
  rowCount: number;
  /** Rows that are not in the app yet. */
  newRowCount: number;
  /** Rows that are already in the app and will be updated, not duplicated. */
  duplicateCount: number;
  dateRange: { from: string | null; to: string | null };
  /** The columns of the file. */
  columns: string[];
  /** Columns the mapping does not use. */
  unmappedColumns: string[];
  /** Columns the mapping names that the file does not have. */
  missingColumns: string[];
  /** Rows the app could not read, with the reason. */
  errors: { rowNumber: number; reason: string }[];
  /** How many rows had a date that could be read two ways. */
  ambiguousDates: number;
  /** The sum of every amount in the file. */
  totalMinor: number;
  /** The accounts the file belongs to. */
  accounts: ImportAccountPreview[];
  /** The first few rows, so the user can see what the file says. */
  sample: {
    date: string;
    amountMinor: number;
    description: string;
    category: string | null;
  }[];
}

/** What an import did. */
export interface ImportResult {
  accountsUpserted: number;
  transactionsInserted: number;
  transactionsUpdated: number;
  assignmentsWritten: number;
  transferGroupsCreated: number;
  transfersLinked: number;
  suspectedTransfers: number;
  /** Rows the file held that the app could not read. */
  skippedRows: number;
}

/**
 * Lists the user's import profiles.
 *
 * @example
 * const profiles = await listImportProfiles(db, userId);
 */
export async function listImportProfiles(
  db: Database,
  userId: string,
): Promise<ImportProfile[]> {
  const rows = await db
    .select()
    .from(importProfiles)
    .where(eq(importProfiles.userId, userId));

  return rows.map(toProfile);
}

/**
 * Returns one profile, or null when it does not exist.
 *
 * @example
 * const profile = await getImportProfile(db, userId, profileId);
 */
export async function getImportProfile(
  db: Database,
  userId: string,
  id: string,
): Promise<ImportProfile | null> {
  const [row] = await db
    .select()
    .from(importProfiles)
    .where(and(eq(importProfiles.id, id), eq(importProfiles.userId, userId)));

  return row ? toProfile(row) : null;
}

/**
 * Saves a profile.
 *
 * The account key is generated here, once. It never changes afterwards, so
 * renaming a profile never moves its history to another account.
 *
 * @example
 * const profile = await createImportProfile(db, userId, { name: 'SoFi checking', mapping, accountName: 'SoFi Checking', accountType: 'checking', currency: 'USD' });
 */
export async function createImportProfile(
  db: Database,
  userId: string,
  input: ImportProfileInput,
): Promise<ImportProfile> {
  const [row] = await db
    .insert(importProfiles)
    .values({
      userId,
      name: input.name,
      institution: input.institution ?? null,
      mapping: input.mapping,
      accountKey: createAccountKey(input.name),
      accountName: input.accountName,
      accountType: input.accountType,
      currency: input.currency.toUpperCase(),
    })
    .returning();

  if (!row) throw new Error('Could not save the import profile');
  return toProfile(row);
}

/**
 * Changes a profile. Returns null when it does not exist.
 *
 * @example
 * await updateImportProfile(db, userId, profileId, { mapping: newMapping });
 */
export async function updateImportProfile(
  db: Database,
  userId: string,
  id: string,
  input: Partial<ImportProfileInput>,
): Promise<ImportProfile | null> {
  const [row] = await db
    .update(importProfiles)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.institution !== undefined ? { institution: input.institution } : {}),
      ...(input.mapping !== undefined ? { mapping: input.mapping } : {}),
      ...(input.accountName !== undefined ? { accountName: input.accountName } : {}),
      ...(input.accountType !== undefined ? { accountType: input.accountType } : {}),
      ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(importProfiles.id, id), eq(importProfiles.userId, userId)))
    .returning();

  return row ? toProfile(row) : null;
}

/**
 * Deletes a profile. The transactions it imported stay.
 *
 * @example
 * await deleteImportProfile(db, userId, profileId);
 */
export async function deleteImportProfile(
  db: Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(importProfiles)
    .where(and(eq(importProfiles.id, id), eq(importProfiles.userId, userId)))
    .returning({ id: importProfiles.id });

  return rows.length > 0;
}

/**
 * Shows what a file would do, without doing anything.
 *
 * @example
 * const preview = await previewImport(db, userId, { profile, content: text, fileName: 'export.csv' });
 * preview.newRowCount; // 412
 */
export async function previewImport(
  db: Database,
  userId: string,
  options: { profile: ImportProfile; content: string; fileName: string },
): Promise<ImportPreview> {
  const { profile, content, fileName } = options;
  const read = readFile(profile, content);
  const { outcome, accounts: fileAccounts, transactions: fileTransactions } = read;

  const existing = await findExistingTransactions(db, userId, fileAccounts, fileTransactions);
  const duplicateCount = fileTransactions.filter((transaction) =>
    existing.transactions.has(transaction.externalId),
  ).length;

  const accounts: ImportAccountPreview[] = fileAccounts.map((account) => ({
    externalId: account.externalId,
    name: account.name,
    type: account.type,
    currency: account.currency,
    exists: existing.accounts.has(account.externalId),
    rowCount: fileTransactions.filter((transaction) => transaction.accountId === account.externalId)
      .length,
  }));

  return {
    fileName,
    rowCount: fileTransactions.length,
    newRowCount: fileTransactions.length - duplicateCount,
    duplicateCount,
    dateRange: outcome.dateRange,
    columns: outcome.columns,
    unmappedColumns: outcome.unmappedColumns,
    missingColumns: outcome.missingColumns,
    errors: outcome.errors.map((error) => ({ rowNumber: error.rowNumber, reason: error.reason })),
    ambiguousDates: outcome.ambiguousDates,
    totalMinor: outcome.totalMinor,
    accounts,
    sample: fileTransactions.slice(0, 5).map((transaction) => ({
      date: transaction.postedAt ? transaction.postedAt.toISOString().slice(0, 10) : '',
      amountMinor: transaction.amountMinor,
      description: transaction.descriptionRaw,
      category: transaction.sourceCategory ?? null,
    })),
  };
}

/**
 * Imports a file.
 *
 * The rows are written the same way a bank connection writes them, so rules,
 * merchant memory and transfer detection all apply.
 *
 * @example
 * const result = await runImport(db, userId, { profile, content: text });
 * result.transactionsInserted; // 412
 */
export async function runImport(
  db: Database,
  userId: string,
  options: { profile: ImportProfile; content: string },
): Promise<ImportResult> {
  const { profile, content } = options;
  const read = readFile(profile, content);

  const adapter = new CsvAdapter({
    content,
    mapping: profile.mapping,
    accountKey: profile.accountKey,
    accountName: profile.accountName,
    accountType: profile.accountType,
    currency: profile.currency,
  });

  const result = await syncFromAdapter({ db, adapter, userId });

  return {
    accountsUpserted: result.accountsUpserted,
    transactionsInserted: result.transactionsInserted,
    transactionsUpdated: result.transactionsUpdated,
    assignmentsWritten: result.assignmentsWritten,
    transferGroupsCreated: result.transferGroupsCreated,
    transfersLinked: result.transfersLinked,
    suspectedTransfers: result.suspectedTransfers,
    skippedRows: read.outcome.errors.length,
  };
}

/** Reads a file the way its profile says. */
function readFile(profile: ImportProfile, content: string) {
  return readCsvFile({
    content,
    mapping: profile.mapping,
    accountKey: profile.accountKey,
    accountName: profile.accountName,
    accountType: profile.accountType,
    currency: profile.currency,
  });
}

/**
 * Finds the rows of the file that are already in the app.
 *
 * The account may not exist yet, in which case nothing is a duplicate.
 */
async function findExistingTransactions(
  db: Database,
  userId: string,
  fileAccounts: { externalId: string }[],
  fileTransactions: { accountId: string; externalId: string }[],
): Promise<{ accounts: Set<string>; transactions: Set<string> }> {
  const accountRows = await db
    .select({ id: accounts.id, externalId: accounts.externalId })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.adapterId, 'csv'),
        inArray(
          accounts.externalId,
          fileAccounts.map((account) => account.externalId),
        ),
      ),
    );

  const accountIds = new Map(accountRows.map((row) => [row.externalId, row.id]));
  if (accountIds.size === 0) {
    return { accounts: new Set(), transactions: new Set() };
  }

  const externalIds = [...new Set(fileTransactions.map((transaction) => transaction.externalId))];
  const rows = await db
    .select({ externalId: transactions.externalId })
    .from(transactions)
    .where(
      and(
        inArray(
          transactions.accountId,
          [...accountIds.values()],
        ),
        inArray(transactions.externalId, externalIds),
      ),
    );

  return {
    accounts: new Set(accountRows.map((row) => row.externalId)),
    transactions: new Set(rows.map((row) => row.externalId)),
  };
}

/** The key of the account a profile imports into. */
function createAccountKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = createHash('sha256').update(randomUUID()).digest('hex').slice(0, 8);
  return `csv:${slug || 'account'}-${suffix}`;
}

/** Converts a row into a profile. */
function toProfile(row: typeof importProfiles.$inferSelect): ImportProfile {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    mapping: row.mapping,
    accountKey: row.accountKey,
    accountName: row.accountName,
    accountType: row.accountType,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
