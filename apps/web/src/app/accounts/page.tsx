import { Card } from '@/components/card.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { formatAmount } from '@/components/money.tsx';
import { StatCard } from '@/components/stat-card.tsx';
import { getAccountsData } from '@/lib/data.ts';
import { formatAccountName, formatShortDate } from '@/lib/format.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Accounts' };

export default async function AccountsPage() {
  const data = await getAccountsData();

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
      <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>

      <div className="grid grid-cols-1 gap-2.5 ph:grid-cols-2 ph:gap-3 sm:grid-cols-3">
        <StatCard
          label="Net worth"
          value={formatAmount(data.netWorthMinor)}
          hint="Assets minus liabilities"
          tone="brand"
          className="ph:col-span-2"
        />
        <StatCard label="Assets" value={formatAmount(data.assetsMinor)} hint="Cash and savings" />
        <StatCard
          label="Liabilities"
          value={formatAmount(data.liabilitiesMinor)}
          hint="Credit card balances"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.accounts.map((account) => (
          <Card key={account.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatAccountName(account.name, account.mask)}
                </p>
                <p className="mt-0.5 text-xs capitalize text-slate-500 dark:text-slate-400">
                  {account.type.replace('_', ' ')}
                  {account.isLiability ? ' · liability' : ''}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {account.currency}
              </span>
            </div>

            <p className="tabular mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {account.balanceMinor === null
                ? '—'
                : formatAmount(account.balanceMinor, account.currency)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {account.balanceAsOf
                ? `Balance as of ${formatShortDate(account.balanceAsOf.toISOString().slice(0, 10))}`
                : 'No balance snapshot yet'}
            </p>
          </Card>
        ))}
      </div>

      <Card title="Balance history" subtitle="Month-end snapshots">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">Balance history per account</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap">
                  Date
                </th>
                {data.accounts.map((account) => (
                  <th key={account.id} scope="col" className="py-2 pr-3 text-right font-medium">
                    {account.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {[...data.balances]
                .reverse()
                .slice(0, 24)
                .map((balance) => (
                  <tr key={`${balance.accountId}-${balance.asOf.toISOString()}`}>
                    <th
                      scope="row"
                      className="py-1.5 pr-3 text-left font-normal whitespace-nowrap text-slate-700 dark:text-slate-200"
                    >
                      {formatShortDate(balance.asOf.toISOString().slice(0, 10))}
                    </th>
                    {data.accounts.map((account) => (
                      <td
                        key={account.id}
                        className="tabular py-1.5 pr-3 text-right whitespace-nowrap text-slate-600 dark:text-slate-300"
                      >
                        {balance.accountId === account.id
                          ? formatAmount(balance.balanceMinor, balance.currency)
                          : ''}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
