import { ImportWizard } from '@/components/import-wizard.tsx';
import { PageHeader } from '@/components/page-header.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getImportData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Import' };

export default async function ImportPage() {
  await requireUser();

  const data = await getImportData();

  if (!data) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No user is set up yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Transactions / Import"
        title="Import a file"
        description="Map a bank CSV once, then reuse the profile for future exports."
      />

      <ImportWizard profiles={data.profiles} />
    </div>
  );
}
