import { ImportWizard } from '@/components/import-wizard.tsx';
import { getImportData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Import' };

export default async function ImportPage() {
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
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Import a file</h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Bring in a CSV export from your bank. You tell the app how the file is laid out once, and
          it remembers it for the next export of the same bank.
        </p>
      </div>

      <ImportWizard profiles={data.profiles} />
    </div>
  );
}
