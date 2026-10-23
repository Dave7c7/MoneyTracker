/**
 * Downloads the transactions, as a spreadsheet or as JSON.
 *
 * The CSV is for a person: one row per transaction, a decimal amount, and the
 * reason a category was chosen. The JSON is for a machine, or for a copy of the
 * data that keeps the accounts and the categories with it, in minor units.
 *
 * Both honour the same filters, so a download can be one account or one year.
 * Nothing is written to the database: an export is a read.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  exportFileName,
  transactionsToCsv,
  type ExportTransaction,
} from '@moneytracker/core';

import { getExportData } from '@/lib/data.ts';
import { getEnv } from '@/lib/env.ts';
import { plainDate } from '@/lib/filters.ts';

export const dynamic = 'force-dynamic';

/** The query string: what to download, and how much of it. */
const exportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  from: plainDate.optional(),
  to: plainDate.optional(),
  accountId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  // A plain form sends the empty fields too, and an empty date means "no bound".
  const query = Object.fromEntries(
    [...url.searchParams.entries()].filter(([, value]) => value.trim() !== ''),
  );
  const parsed = exportQuerySchema.safeParse(query);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'That export request is not valid.' },
      { status: 400 },
    );
  }

  const { format, from, to, accountId } = parsed.data;

  const data = await getExportData({ from, to, accountId });
  if (!data) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const rows = data.rows.map((row): ExportTransaction => ({
    postedDate: row.postedDate,
    description: row.descriptionRaw,
    merchant: row.merchantName,
    category: row.categoryName,
    account: row.accountName,
    amountMinor: row.amountMinor,
    currency: row.currency,
    pending: row.pending,
    transfer: row.transferGroupId !== null,
    categorySource: row.assignmentSource,
    categoryReason: row.reason,
  }));

  const fileName = exportFileName(format, dayIn(getEnv().APP_TIMEZONE));
  const headers = {
    'Content-Disposition': `attachment; filename="${fileName}"`,
    // An export is a snapshot of money; no cache should keep it.
    'Cache-Control': 'no-store',
  };

  if (format === 'csv') {
    return new NextResponse(transactionsToCsv(rows), {
      headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' },
    });
  }

  const body = {
    app: 'moneytracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    range: { from: from ?? null, to: to ?? null },
    accounts: data.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      mask: account.mask,
      liability: account.isLiability,
      balanceMinor: account.latestBalanceMinor,
      balanceAsOf: account.latestBalanceAt?.toISOString() ?? null,
    })),
    categories: data.categories.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
      parentId: category.parentId,
      color: category.color,
    })),
    transactions: data.rows.map((row) => ({
      id: row.id,
      date: row.postedDate,
      description: row.descriptionRaw,
      merchant: row.merchantName,
      category: row.categoryName,
      account: row.accountName,
      accountId: row.accountId,
      // Minor units, as integers: JSON is for machines. The CSV writes decimals.
      amountMinor: row.amountMinor,
      currency: row.currency,
      pending: row.pending,
      transfer: row.transferGroupId !== null,
      categorySource: row.assignmentSource,
      categoryReason: row.reason,
      splits: row.splitLines.map((line) => ({
        category: line.categoryName,
        amountMinor: line.amountMinor,
        note: line.note,
      })),
    })),
  };

  return NextResponse.json(body, { headers });
}

/**
 * Today, in the app's timezone, as a plain date for the file name.
 *
 * @example
 * dayIn('America/Los_Angeles'); // '2026-10-23'
 */
function dayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}
