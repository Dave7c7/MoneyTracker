import { Card } from '@/components/card.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { formatAmount } from '@/components/money.tsx';
import { PageHeader } from '@/components/page-header.tsx';
import { StatCard } from '@/components/stat-card.tsx';
import { SubscriptionsManager } from '@/components/subscriptions-manager.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getSubscriptionsData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Subscriptions' };

export default async function SubscriptionsPage() {
  await requireUser();

  const data = await getSubscriptionsData();

  if (!data) {
    return (
      <EmptyState
        title="No data yet"
        description="Run the seed command to load the demo dataset, or connect a bank to get started."
      />
    );
  }

  const dueSoon = data.upcoming.reduce((sum, item) => sum + item.amountMinor, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Recurring / Bills"
        title="Subscriptions"
        description="Review recurring charges, upcoming bills and price changes."
        action={<span className="finance-badge">{data.items.length} recurring</span>}
      />

      <div className="grid grid-cols-2 gap-2.5 ph:grid-cols-3 ph:gap-3 lg:grid-cols-3">
        <StatCard
          label="Every month"
          value={formatAmount(data.monthlyMinor)}
          hint="What the recurring charges cost"
          tone="brand"
          className="ph:col-span-2"
        />
        <StatCard
          label="Every year"
          value={formatAmount(data.annualMinor)}
          hint="The same, over a year"
        />
        <StatCard
          label="Due in 30 days"
          value={formatAmount(dueSoon)}
          hint={`${data.upcoming.length} charges`}
        />
        <StatCard
          label="Needs a look"
          value={String(data.detected)}
          hint="Found by the app, waiting for you"
        />
      </div>

      <Card title="Recurring charges" subtitle="Subscriptions and bills the app knows about">
        <SubscriptionsManager
          initialItems={data.items.map((item) => ({
            id: item.id,
            merchantName: item.merchantName,
            amountMinor: item.amountMinor,
            currency: item.currency,
            cadence: item.cadence,
            status: item.status,
            nextDate: item.nextDate,
            priceChanged: item.priceChanged,
            previousAmountMinor: item.previousAmountMinor,
            occurrences: item.occurrences,
            confidence: item.confidence,
            reason: item.reason,
            isManual: item.isManual,
          }))}
          upcoming={data.upcoming.map((item) => ({
            id: item.id,
            merchantName: item.merchantName,
            amountMinor: item.amountMinor,
            currency: item.currency,
            nextDate: item.nextDate,
            cadence: item.cadence,
          }))}
          today={data.today}
        />
      </Card>
    </div>
  );
}
