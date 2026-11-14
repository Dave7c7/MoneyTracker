import { EmptyState } from '@/components/empty-state.tsx';
import { PageHeader } from '@/components/page-header.tsx';
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
      <PageHeader
        eyebrow="Categorization / Your logic"
        title="Rules"
        description="Your rules always beat the bank's guess. The first rule in the list wins."
      />

      <RulesManager
        initialRules={data.rules}
        categories={data.categories}
        accounts={data.accounts}
      />
    </div>
  );
}
