import { Card } from '@/components/card.tsx';
import { CashFlowChart } from '@/components/charts/cash-flow-chart.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { formatAmount, formatSignedAmount } from '@/components/money.tsx';
import { StatCard } from '@/components/stat-card.tsx';
import { getCashFlowData } from '@/lib/data.ts';
import { formatMonth } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Cash flow' };

export default async function CashFlowPage() {
  const data = await getCashFlowData();

  if (!data) {
    return (
      <EmptyState
        title="No data yet"
        description="Run the seed command to load the demo dataset, or connect a bank to get started."
      />
    );
  }

  const averageNet =
    data.cashFlow.length > 0 ? Math.round(data.totals.netMinor / data.cashFlow.length) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Cash flow</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {formatMonth(data.month)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 ph:gap-3 lg:grid-cols-4">
        <StatCard
          label="Income"
          value={formatAmount(data.current?.incomeMinor ?? 0)}
          hint={formatMonth(data.month)}
        />
        <StatCard
          label="Expenses"
          value={formatAmount(data.current?.expenseMinor ?? 0)}
          hint={formatMonth(data.month)}
        />
        <StatCard
          label="Net"
          value={formatSignedAmount(data.current?.netMinor ?? 0)}
          hint="Income minus expenses"
        />
        <StatCard
          label="12-month average"
          value={formatSignedAmount(averageNet)}
          hint="Net savings per month"
        />
      </div>

      <Card
        title="Income against expenses"
        subtitle={`${formatMonth(data.months[0] ?? data.month)} to ${formatMonth(data.month)} · ${data.timeZone}`}
      >
        <CashFlowChart entries={data.cashFlow} currency="USD" />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Transfers are excluded from income and expenses.
        </p>
      </Card>

      <Card title="Month by month">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <caption className="sr-only">Income, expenses and net savings per month</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap">
                  Month
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Income
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Expenses
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Net
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...data.cashFlow].reverse().map((entry) => (
                <tr key={entry.month}>
                  <th
                    scope="row"
                    className="py-2 pr-3 text-left font-normal whitespace-nowrap text-slate-700 dark:text-slate-200"
                  >
                    {formatMonth(entry.month)}
                  </th>
                  <td className="tabular py-2 pr-3 text-right whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {formatAmount(entry.incomeMinor)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right whitespace-nowrap text-slate-600 dark:text-slate-300">
                    {formatAmount(entry.expenseMinor)}
                  </td>
                  <td
                    className={`tabular py-2 text-right font-medium whitespace-nowrap ${
                      entry.netMinor >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatSignedAmount(entry.netMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
