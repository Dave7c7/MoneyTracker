import Link from 'next/link';

import { ReviewInbox } from '@/components/review-inbox.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { getReviewData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Review' };

export default async function ReviewPage() {
  const data = await getReviewData();

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
        <h2 className="text-lg font-semibold tracking-tight">Review</h2>
        <div className="flex gap-3 text-sm">
          <span className="text-slate-500 dark:text-slate-400">
            {data.needsReview} to categorize
          </span>
          <Link
            href="/rules"
            className="font-medium text-brand-600 hover:underline dark:text-brand-500"
          >
            Rules
          </Link>
        </div>
      </div>

      <ReviewInbox
        groups={data.groups}
        categories={data.categories}
        needsReview={data.needsReview}
      />
    </div>
  );
}
