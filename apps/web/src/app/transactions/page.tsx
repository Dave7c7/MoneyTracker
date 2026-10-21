import { Card } from '@/components/card.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { TransactionFilters } from '@/components/transaction-filters.tsx';
import { TransactionList } from '@/components/transaction-list.tsx';
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
  const params = await searchParams;
  const filters = parseTransactionFilters(params as Record<string, unknown>);
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
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Transactions</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">{data.rows.length} shown</span>
      </div>

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
          {/*
            The key changes with the filters, so the list starts again with
            the rows the server just sent. Without it the list would keep the
            rows it was given when it first mounted.
          */}
          <TransactionList key={filterKey} initialRows={data.rows} categories={data.categories} />
        </Card>
      )}
    </div>
  );
}
