import Link from 'next/link';

import { Card } from '@/components/card.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { PageHeader } from '@/components/page-header.tsx';
import { TransactionFilters } from '@/components/transaction-filters.tsx';
import { TransactionList } from '@/components/transaction-list.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getTransactionsData } from '@/lib/data.ts';
import { parseTransactionFilters } from '@/lib/filters.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Transactions' };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();

  const params = await searchParams;
  const view = parseView(params.view);
  const filters = parseTransactionFilters({
    // Grouped by day or week, a page of 100 would cut a week in half.
    ...(view !== 'list' && params.limit === undefined ? { limit: '500' } : {}),
    ...(params as Record<string, unknown>),
  });
  const data = await getTransactionsData(filters);

  // The list is remounted whenever the filters change, so it always shows the
  // rows the server just sent.
  const filterKey = [
    filters.search ?? '',
    filters.accountId ?? '',
    filters.categoryId ?? '',
    filters.from ?? '',
    filters.to ?? '',
    filters.limit,
    filters.offset,
  ].join('|');

  if (!data) {
    return (
      <EmptyState
        title="No data yet"
        description="Run the seed command to load the demo dataset, or connect a bank to get started."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Activity / Every transaction"
        title="Transactions"
        description="Search, filter, categorize and explain every movement between your accounts."
        action={<span className="finance-badge">{data.rows.length} shown</span>}
      />

      <Card>
        <TransactionFilters
          categories={data.categories}
          accounts={data.accounts}
          initial={{
            search: filters.search,
            accountId: filters.accountId,
            categoryId: filters.categoryId,
            from: filters.from,
            to: filters.to,
          }}
        />
      </Card>

      {data.rows.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description="Try widening the date range or clearing the filters."
        />
      ) : (
        <Card className="p-0 sm:p-0">
          <nav
            aria-label="Group transactions"
            className="flex items-center gap-1 border-b border-slate-100 px-3 py-2 dark:border-slate-800"
          >
            {VIEWS.map((option) => (
              <Link
                key={option.value}
                href={viewHref(params, option.value)}
                scroll={false}
                aria-current={view === option.value ? 'page' : undefined}
                className={`finance-button finance-button--small ${
                  view === option.value ? 'finance-button--primary' : 'finance-button--ghost'
                }`}
              >
                {option.label}
              </Link>
            ))}
          </nav>
          {/*
            The key changes with the filters, so the list starts again with
            the rows the server just sent. Without it the list would keep the
            rows it was given when it first mounted.
          */}
          <TransactionList
            key={filterKey}
            initialRows={data.rows}
            categories={data.categories}
            groupBy={view === 'list' ? null : view}
          />
        </Card>
      )}
    </div>
  );
}

type View = 'list' | 'day' | 'week';

const VIEWS: ReadonlyArray<{ value: View; label: string }> = [
  { value: 'list', label: 'List' },
  { value: 'day', label: 'By day' },
  { value: 'week', label: 'By week' },
];

function parseView(value: string | string[] | undefined): View {
  return value === 'day' || value === 'week' ? value : 'list';
}

/** The same page with another grouping, keeping every filter. */
function viewHref(params: SearchParams, view: View): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'view' || key === 'offset' || typeof value !== 'string') continue;
    next.set(key, value);
  }
  if (view !== 'list') next.set('view', view);
  return next.size > 0 ? `/transactions?${next.toString()}` : '/transactions';
}
