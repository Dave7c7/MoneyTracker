import { Card } from '@/components/card.tsx';
import { BudgetsManager } from '@/components/budgets-manager.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { PageHeader } from '@/components/page-header.tsx';
import { formatMonth } from '@/lib/format.ts';
import { requireUser } from '@/lib/auth.ts';
import { getBudgetsData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Budgets' };

export default async function BudgetsPage() {
  await requireUser();

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
      <PageHeader
        eyebrow="Plan / Spending limits"
        title="Budgets"
        description="Compare category limits with actual spending."
        action={<span className="finance-badge">{formatMonth(data.month)}</span>}
      />

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
