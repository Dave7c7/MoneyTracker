import { Card } from '@/components/card.tsx';
import { BudgetsManager } from '@/components/budgets-manager.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { formatMonth } from '@/lib/format.ts';
import { getBudgetsData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Budgets' };

export default async function BudgetsPage() {
  const data = await getBudgetsData();

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
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Budgets</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {formatMonth(data.month)}
        </span>
      </div>

      <Card title="Budget against actual" subtitle="What was spent in each category this month">
        <BudgetsManager
          initialStatus={data.status}
          budgets={data.budgets.map((budget) => ({ id: budget.id, categoryId: budget.categoryId }))}
          categories={data.categories}
        />
      </Card>
    </div>
  );
}
