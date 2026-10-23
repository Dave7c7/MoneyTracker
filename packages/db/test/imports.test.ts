/**
 * Integration tests for the import service.
 *
 * These need a real Postgres. Point TEST_DATABASE_URL at a scratch database
 * and they run; without it they skip, so `pnpm test` still passes on a
 * machine with no database.
 *
 *   TEST_DATABASE_URL=postgresql://moneytracker:moneytracker@localhost:5432/moneytracker_test pnpm test
 */

import { eq, sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createCsvMapping, type CsvMapping } from '@moneytracker/core';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import {
  ensureBankCategoryMappings,
  ensureDefaultCategories,
  ensureLocalUser,
} from '../src/bootstrap.ts';
import { createDatabase, type Database } from '../src/client.ts';
import { loadDotEnv } from '../src/env.ts';
import {
  createImportProfile,
  listImportProfiles,
  previewImport,
  runImport,
  type ImportProfile,
} from '../src/imports.ts';
import { accounts, transactions } from '../src/schema.ts';

loadDotEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

const MAPPING: CsvMapping = createCsvMapping({
  dateColumn: 'Date',
  amountColumn: 'Amount',
  descriptionColumn: 'Description',
});

const FILE = [
  'Date,Amount,Description',
  '2026-01-05,-12.34,BLUE BOTTLE COFFEE',
  '2026-01-06,2500.00,PAYROLL',
  '2026-01-07,-45.00,BOOK STORE',
].join('\n');

describe.skipIf(!testDatabaseUrl)('import service', () => {
  let db: Database;
  let userId: string;
  let close: () => Promise<void>;
  let profile: ImportProfile;

  beforeAll(async () => {
    const created = createDatabase(testDatabaseUrl!, { max: 4 });
    db = created.db;
    close = () => created.pool.end();

    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await db.execute(
      sql`truncate table category_assignments, transactions, merchants, balance_snapshots, rules, bank_category_mappings, import_profiles, categories, accounts, users restart identity cascade;`,
    );

    const user = await ensureLocalUser(db, {
      email: 'test@example.com',
      displayName: 'Test',
      timeZone: 'UTC',
    });
    userId = user.id;

    const categoryIds = await ensureDefaultCategories(db, userId);
    await ensureBankCategoryMappings(db, userId, categoryIds);

    profile = await createImportProfile(db, userId, {
      name: 'SoFi checking',
      institution: 'SoFi',
      mapping: MAPPING,
      accountName: 'SoFi Checking',
      accountType: 'checking',
      currency: 'USD',
    });
  });

  it('saves a profile with an account key of its own', async () => {
    const profiles = await listImportProfiles(db, userId);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.name).toBe('SoFi checking');
    expect(profiles[0]?.accountKey).toMatch(/^csv:sofi-checking-[0-9a-f]{8}$/);
  });

  it('shows what a file would do before it does it', async () => {
    const preview = await previewImport(db, userId, {
      profile,
      content: FILE,
      fileName: 'export.csv',
    });

    expect(preview.rowCount).toBe(3);
    expect(preview.newRowCount).toBe(3);
    expect(preview.duplicateCount).toBe(0);
    expect(preview.dateRange).toEqual({ from: '2026-01-05', to: '2026-01-07' });
    expect(preview.unmappedColumns).toEqual([]);
    expect(preview.accounts).toHaveLength(1);
    expect(preview.accounts[0]?.exists).toBe(false);
    expect(preview.sample[0]).toMatchObject({
      date: '2026-01-05',
      amountMinor: -1234,
      description: 'BLUE BOTTLE COFFEE',
    });
  });

  it('imports the rows of a file', async () => {
    const result = await runImport(db, userId, { profile, content: FILE });

    expect(result.transactionsInserted).toBe(3);

    const rows = await db.select().from(transactions);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.amountMinor).sort((a, b) => a - b)).toEqual([
      -4500, -1234, 250000,
    ]);
  });

  it('importing the same file twice creates no duplicates', async () => {
    await runImport(db, userId, { profile, content: FILE });
    const second = await runImport(db, userId, { profile, content: FILE });

    expect(second.transactionsInserted).toBe(0);
    // Nothing changed either, so the rows were left exactly as they were.
    expect(second.transactionsUpdated).toBe(0);

    const rows = await db.select().from(transactions);
    expect(rows).toHaveLength(3);
  });

  it('says how many rows are already in the app', async () => {
    await runImport(db, userId, { profile, content: FILE });

    const preview = await previewImport(db, userId, {
      profile,
      content: FILE,
      fileName: 'export.csv',
    });

    expect(preview.duplicateCount).toBe(3);
    expect(preview.newRowCount).toBe(0);
    expect(preview.accounts[0]?.exists).toBe(true);
  });

  it('keeps the account of a profile across imports', async () => {
    await runImport(db, userId, { profile, content: FILE });
    await runImport(db, userId, { profile, content: FILE });

    const rows = await db.select().from(accounts);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.adapterId).toBe('csv');
    expect(rows[0]?.name).toBe('SoFi Checking');
  });

  it('categorizes the rows it imports', async () => {
    await runImport(db, userId, { profile, content: FILE });

    const assignments = await db.execute(
      sql`select source from category_assignments order by source`,
    );
    expect(assignments.rows.length).toBe(3);
  });

  it('reports the rows it cannot read and imports the rest', async () => {
    const result = await runImport(db, userId, {
      profile,
      content: ['Date,Amount,Description', '2026-01-05,-1.00,COFFEE', 'nope,-2.00,BOOK'].join('\n'),
    });

    expect(result.transactionsInserted).toBe(1);
    expect(result.skippedRows).toBe(1);
  });

  it('reads a file that names several accounts', async () => {
    const multi = await createImportProfile(db, userId, {
      name: 'Everything',
      mapping: createCsvMapping({ ...MAPPING, accountColumn: 'Account' }),
      accountName: 'Everything',
      accountType: 'checking',
      currency: 'USD',
    });

    await runImport(db, userId, {
      profile: multi,
      content: [
        'Date,Account,Amount,Description',
        '2026-01-05,Checking,-1.00,COFFEE',
        '2026-01-06,Savings,-2.00,BOOK',
      ].join('\n'),
    });

    const rows = await db.select().from(accounts);
    expect(rows).toHaveLength(2);
  });

  it('does not import into the account of another user', async () => {
    const other = await ensureLocalUser(db, {
      email: 'other@example.com',
      displayName: 'Other',
      timeZone: 'UTC',
    });
    const otherCategoryIds = await ensureDefaultCategories(db, other.id);
    await ensureBankCategoryMappings(db, other.id, otherCategoryIds);

    const result = await runImport(db, other.id, { profile, content: FILE });

    expect(result.transactionsInserted).toBe(3);
    const rows = await db.select().from(transactions).where(eq(transactions.userId, userId));
    expect(rows).toHaveLength(0);
  });
});
