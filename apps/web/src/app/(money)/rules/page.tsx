import { EmptyState } from '@/components/empty-state.tsx';
import { RulesManager } from '@/components/rules-manager.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getRulesData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Rules' };

export default async function RulesPage() {
  await requireUser();

  const data = await getRulesData();

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
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Rules</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Your rules always beat the bank&apos;s guess. The first rule in the list wins.
        </p>
      </div>

      <RulesManager
        initialRules={data.rules}
        categories={data.categories}
        accounts={data.accounts}
      />
    </div>
  );
}
