import { Card } from '@/components/card.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { GoalsManager } from '@/components/goals-manager.tsx';
import { getGoalsData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Goals' };

export default async function GoalsPage() {
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
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Goals</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {data.goals.length} saving
        </span>
      </div>

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
