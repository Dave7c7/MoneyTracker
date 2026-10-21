import { Card } from '@/components/card.tsx';
import { CategoryPill, colorForName } from '@/components/category-pill.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { Money } from '@/components/money.tsx';
import { TransactionFilters } from '@/components/transaction-filters.tsx';
import { getTransactionsData } from '@/lib/data.ts';
import { parseTransactionFilters } from '@/lib/filters.ts';
import { formatShortDate } from '@/lib/format.ts';

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
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.rows.map((transaction) => (
              <li key={transaction.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {transaction.merchantName ?? transaction.descriptionRaw}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {transaction.merchantName
                        ? transaction.descriptionRaw
                        : transaction.accountName}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <CategoryPill
                        name={transaction.categoryName ?? 'Uncategorized'}
                        color={colorForName(transaction.categoryName ?? 'Uncategorized')}
                        source={transaction.assignmentSource}
                        confidence={transaction.confidence}
                      />
                      <span className="text-xs text-slate-400">
                        {formatShortDate(transaction.postedDate)}
                      </span>
                      <span className="text-xs text-slate-400">· {transaction.accountName}</span>
                      {transaction.pending && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          Pending
                        </span>
                      )}
                    </div>
                    {transaction.reason && (
                      <p className="mt-1 text-xs italic text-slate-400">{transaction.reason}</p>
                    )}
                  </div>
                  <Money
                    amountMinor={transaction.amountMinor}
                    currency={transaction.currency}
                    className="shrink-0 text-sm font-semibold"
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
