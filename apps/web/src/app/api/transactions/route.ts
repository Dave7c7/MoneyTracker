import { NextResponse } from 'next/server';

import { getTransactionsData } from '@/lib/data.ts';
import { parseTransactionFilters } from '@/lib/filters.ts';

/**
 * Lists transactions.
 *
 * Every parameter is validated with Zod before it reaches the query layer.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseTransactionFilters(Object.fromEntries(url.searchParams.entries()));

  const data = await getTransactionsData(filters);
  if (!data) {
    return NextResponse.json({ error: 'No user configured' }, { status: 503 });
  }

  return NextResponse.json({
    transactions: data.rows.map((row) => ({
      id: row.id,
      postedAt: row.postedAt?.toISOString() ?? null,
      postedDate: row.postedDate,
      pending: row.pending,
      amountMinor: row.amountMinor,
      currency: row.currency,
      description: row.descriptionRaw,
      merchant: row.merchantName,
      category: row.categoryName,
      categoryKind: row.categoryKind,
      source: row.assignmentSource,
      confidence: row.confidence,
      reason: row.reason,
      account: row.accountName,
    })),
    count: data.rows.length,
  });
}
