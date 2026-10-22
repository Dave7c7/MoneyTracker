import Link from 'next/link';

import { Card } from '@/components/card.tsx';
import { CategoryPill, colorForName } from '@/components/category-pill.tsx';
import { SpendingByCategoryChart } from '@/components/charts/spending-chart.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { formatAmount, Money } from '@/components/money.tsx';
import { StatCard } from '@/components/stat-card.tsx';
import { getOverviewData } from '@/lib/data.ts';
import { formatAccountName, formatMonth, formatPercent, formatShortDate } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const data = await getOverviewData();

  if (!data) {
    return (
      <EmptyState
        title="No data yet"
        description="Run the seed command to load the demo dataset, or connect a bank to get started."
        action={
          <code className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            pnpm db:seed
          </code>
        }
      />
    );
  }

  const current = data.cashFlow.find((entry) => entry.month === data.month);
  const spendingThisMonth = current?.expenseMinor ?? 0;
  const incomeThisMonth = current?.incomeMinor ?? 0;
  const netThisMonth = current?.netMinor ?? 0;
  const deltaPercent = data.comparison.deltaPercent;
  const deltaIsSpendingMore = data.comparison.deltaMinor > 0;

  const monthIndex = data.months.indexOf(data.month);
  const monthCategories = data.spending.categories
    .map((category) => ({
      ...category,
      total: monthIndex >= 0 ? (category.monthly[monthIndex] ?? 0) : 0,
    }))
    .filter((category) => category.total > 0)
    .sort((a, b) => b.total - a.total);

  const chartCategories = monthCategories.slice(0, 7).map((category) => ({
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    monthly: category.monthly,
  }));

  const chartColors = Object.fromEntries(
    chartCategories.map((category) => [category.categoryId, colorForName(category.categoryName)]),
  );

  const largestCategory = monthCategories[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{formatMonth(data.month)}</h2>
        <div className="flex gap-3 text-sm font-medium">
          <Link
            href="/rules"
            className="text-slate-500 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
          >
            Rules
          </Link>
          <Link href="/spending" className="text-brand-600 hover:underline dark:text-brand-500">
            See spending
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 ph:gap-3 lg:grid-cols-4">
        <StatCard
          label="Spending"
          value={formatAmount(spendingThisMonth)}
          delta={
            deltaPercent === null
              ? undefined
              : {
                  value: `${formatPercent(deltaPercent)} vs last month`,
                  direction: deltaIsSpendingMore ? 'up' : 'down',
                  positive: !deltaIsSpendingMore,
                }
          }
        />
        <StatCard label="Income" value={formatAmount(incomeThisMonth)} hint="This month" />
        <StatCard
          label="Net savings"
          value={formatAmount(netThisMonth)}
          hint={netThisMonth >= 0 ? 'Money left over' : 'Spent more than earned'}
        />
        <Link href="/review" className="block">
          <StatCard
            label="Needs review"
            value={String(data.needsReview)}
            hint={data.needsReview > 0 ? 'Tap to categorize' : 'All caught up'}
            tone={data.needsReview > 0 ? 'brand' : 'neutral'}
          />
        </Link>
      </div>

      {chartCategories.length > 0 ? (
        <Card
          title="Spending by category"
          subtitle={`${formatMonth(data.months[0] ?? data.month)} to ${formatMonth(data.month)} · ${data.timeZone}`}
        >
          <SpendingByCategoryChart
            months={data.months}
            categories={chartCategories}
            colors={chartColors}
            currency="USD"
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Totals exclude transfers and pending transactions.
          </p>
        </Card>
      ) : (
        <EmptyState
          title="Nothing to chart yet"
          description="Once transactions are imported, spending by category appears here."
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top categories" subtitle={`${formatMonth(data.month)}`}>
          {monthCategories.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No spending this month.</p>
          ) : (
            <ul className="space-y-3">
              {monthCategories.slice(0, 6).map((category) => (
                <li key={category.categoryId}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {category.categoryName}
                    </span>
                    <span className="tabular font-medium text-slate-900 dark:text-slate-100">
                      {formatAmount(category.total)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${largestCategory > 0 ? (category.total / largestCategory) * 100 : 0}%`,
                        backgroundColor: colorForName(category.categoryName),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Top merchants" subtitle={`${formatMonth(data.month)}`}>
          {data.topMerchants.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No merchants this month.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.topMerchants.map((merchant) => (
                <li
                  key={merchant.merchantId}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="truncate text-slate-700 dark:text-slate-200">
                    {merchant.merchantName}
                  </span>
                  <span className="tabular font-medium text-slate-900 dark:text-slate-100">
                    {formatAmount(merchant.totalMinor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Accounts"
        action={
          <div className="flex gap-3">
            <Link
              href="/import"
              className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-500"
            >
              Import
            </Link>
            <Link
              href="/accounts"
              className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-500"
            >
              Manage
            </Link>
          </div>
        }
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {formatAccountName(account.name, account.mask)}
                </p>
                <p className="text-xs capitalize text-slate-500 dark:text-slate-400">
                  {account.type.replace('_', ' ')}
                </p>
              </div>
              {account.balanceMinor === null ? (
                <span className="text-xs text-slate-400">No balance</span>
              ) : (
                <Money
                  amountMinor={account.balanceMinor}
                  currency={account.currency}
                  className="text-sm font-medium"
                />
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Recent transactions"
        action={
          <Link
            href="/transactions"
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-500"
          >
            See all
          </Link>
        }
      >
        {data.recent.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No transactions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.recent.map((transaction) => (
              <li key={transaction.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {transaction.merchantName ?? transaction.descriptionRaw}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <CategoryPill
                      name={transaction.categoryName ?? 'Uncategorized'}
                      color={colorForName(transaction.categoryName ?? 'Uncategorized')}
                      source={transaction.assignmentSource}
                      confidence={transaction.confidence}
                    />
                    <span className="text-xs text-slate-400">
                      {formatShortDate(transaction.postedDate)}
                    </span>
                  </div>
                </div>
                <Money
                  amountMinor={transaction.amountMinor}
                  currency={transaction.currency}
                  className="shrink-0 text-sm font-medium"
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
