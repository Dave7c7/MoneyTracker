import Link from 'next/link';

import { ReviewInbox } from '@/components/review-inbox.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { PageHeader } from '@/components/page-header.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getReviewData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Review' };

export default async function ReviewPage() {
  await requireUser();

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
      <PageHeader
        eyebrow="Review / One decision at a time"
        title="Review"
        description="Confirm a suggestion or choose a better category; every correction stays explainable."
        action={
          <div className="flex flex-col items-end gap-1 text-sm sm:flex-row sm:items-center sm:gap-3">
            <span className="finance-badge">{data.needsReview} to categorize</span>
            <Link
              href="/rules"
              className="font-medium text-brand-600 hover:underline dark:text-brand-500"
            >
              Rules
            </Link>
          </div>
        }
      />

      <ReviewInbox
        groups={data.groups}
        categories={data.categories}
        needsReview={data.needsReview}
      />
    </div>
  );
}
