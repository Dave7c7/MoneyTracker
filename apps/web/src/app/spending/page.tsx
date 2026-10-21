import { Card } from '@/components/card.tsx';
import { colorForName } from '@/components/category-pill.tsx';
import { SpendingByCategoryChart } from '@/components/charts/spending-chart.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { formatAmount } from '@/components/money.tsx';
import { StatCard } from '@/components/stat-card.tsx';
import { getSpendingData } from '@/lib/data.ts';
import { formatMonth, formatPercent } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Spending' };

export default async function SpendingPage() {
  const data = await getSpendingData();

  if (!data) {
    return (
      <EmptyState
        title="No data yet"
        description="Run the seed command to load the demo dataset, or connect a bank to get started."
      />
    );
  }

  const monthIndex = data.months.indexOf(data.month);
  const monthTotals = data.categories.map((category) => ({
    ...category,
    total: monthIndex >= 0 ? (category.monthly[monthIndex] ?? 0) : 0,
  }));

  const currentTotal = data.comparison.currentMinor;
  const previousTotal = data.comparison.previousMinor;
  const colors = Object.fromEntries(
    data.categories.map((category) => [category.categoryId, colorForName(category.categoryName)]),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Spending</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {formatMonth(data.month)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 ph:grid-cols-3 ph:gap-3 lg:grid-cols-3">
        <StatCard label="This month" value={formatAmount(currentTotal)} />
        <StatCard
          label="Last month"
          value={formatAmount(previousTotal)}
          hint={formatMonth(data.comparison.previousMonth)}
        />
        <StatCard
          label="Change"
          value={formatPercent(data.comparison.deltaPercent)}
          hint={`${formatAmount(data.comparison.deltaMinor)} month over month`}
        />
      </div>

      {data.categories.length === 0 ? (
        <EmptyState
          title="Nothing spent yet"
          description="Once transactions are imported, spending by category appears here."
        />
      ) : (
        <>
          <Card
            title="By category over time"
            subtitle={`${formatMonth(data.months[0] ?? data.month)} to ${formatMonth(data.month)} · ${data.timeZone}`}
          >
            <SpendingByCategoryChart
              months={data.months}
              categories={data.categories}
              colors={colors}
              currency="USD"
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Totals exclude transfers and pending transactions.
              {data.totalCategories > data.categories.length &&
                ` The smallest ${data.totalCategories - data.categories.length} categories are grouped as "Other".`}
            </p>
          </Card>

          <Card title={`Categories in ${formatMonth(data.month)}`}>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {monthTotals
                .filter((category) => category.total !== 0)
                .sort((a, b) => b.total - a.total)
                .map((category) => (
                  <li
                    key={category.categoryId}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colors[category.categoryId] }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {category.categoryName}
                      </span>
                    </span>
                    <span className="tabular font-medium text-slate-900 dark:text-slate-100">
                      {formatAmount(category.total)}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
