import { CategoriesManager } from '@/components/categories-manager.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { PageHeader } from '@/components/page-header.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getCategoriesData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Categories' };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string | string[] }>;
}) {
  await requireUser();

  const [data, params] = await Promise.all([getCategoriesData(), searchParams]);
  const suggestedName = typeof params.name === 'string' ? params.name.slice(0, 60) : '';

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
        eyebrow="Categorization / Your tree"
        title="Categories"
        description="Add categories of your own, nest them under a group, and rename any of them."
      />

      <CategoriesManager initialCategories={data.categories} initialName={suggestedName} />
    </div>
  );
}
