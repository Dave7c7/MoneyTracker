import { Card } from '@/components/card.tsx';
import { ConnectionsManager } from '@/components/connections-manager.tsx';
import { EmptyState } from '@/components/empty-state.tsx';
import { requireUser } from '@/lib/auth.ts';
import { getConnectionsData } from '@/lib/data.ts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Connections' };

export default async function ConnectionsPage() {
  await requireUser();

  const data = await getConnectionsData();

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
        <h2 className="text-lg font-semibold tracking-tight">Connections</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {data.connections.length} connected
        </span>
      </div>

      <Card
        title="Your banks"
        subtitle="Read-only connections. The app never sees your bank password."
      >
        <ConnectionsManager
          initialConnections={data.connections.map((connection) => ({
            id: connection.id,
            adapterId: connection.adapterId,
            name: connection.name,
            institution: connection.institution,
            status: connection.status,
            lastSyncedAt: connection.lastSyncedAt ? connection.lastSyncedAt.toISOString() : null,
            lastError: connection.lastError,
            historyDays: connection.historyDays,
            accounts: connection.accounts,
          }))}
          canConnect={data.canConnect}
        />
      </Card>
    </div>
  );
}
