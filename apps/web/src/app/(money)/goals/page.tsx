import { Card } from '@/components/card.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { GoalsManager } from '@/components/goals-manager.tsx';
import { PageHeader } from '@/components/page-header.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getGoalsData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Goals' };

export default async function GoalsPage() {
  await requireUser();

  const data = await getGoalsData();

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
        eyebrow="Plan / Saving"
        title="Goals"
        description="Track progress toward your savings targets."
        action={<span className="finance-badge">{data.goals.length} saving</span>}
      />

      <Card title="Savings goals" subtitle="The app keeps track; it never moves money">
        <GoalsManager
          initialGoals={data.goals.map((goal) => ({
            id: goal.id,
            name: goal.name,
            targetMinor: goal.targetMinor,
            savedMinor: goal.savedMinor,
            accountId: goal.accountId,
            accountName: goal.accountName,
            deadline: goal.deadline,
            percentComplete: goal.percentComplete,
            remainingMinor: goal.remainingMinor,
            reached: goal.reached,
            daysLeft: goal.daysLeft,
            neededPerMonthMinor: goal.neededPerMonthMinor,
          }))}
          accounts={data.accounts}
        />
      </Card>
    </div>
  );
}
