/**
 * When a bank connection is due for a sync.
 *
 * The app syncs its own connections, so it does not depend on a cron line on
 * the host. Each connection says how often its provider refreshes
 * (`refreshHours`, a day for SimpleFIN); a connection is synced once that much
 * time has passed since its last successful sync.
 *
 * A connection that keeps failing would otherwise be due on every check, so a
 * failed attempt waits `retryAfterFailureHours` before the next one: an outage
 * at the provider does not turn into a request every few minutes.
 */

/** What the schedule needs to know about a connection. */
export interface ScheduledConnection {
  id: string;
  status: 'active' | 'error' | 'disabled';
  lastSyncedAt: Date | null;
  refreshHours: number;
}

/** Options for {@link connectionsDue}. */
export interface SyncScheduleOptions {
  now: Date;
  /** When each connection was last tried, by id, whatever the outcome. */
  lastAttempts?: ReadonlyMap<string, Date>;
  /** How long a failed connection waits before it is tried again. */
  retryAfterFailureHours?: number;
}

/** The default wait after a failed attempt. */
export const SYNC_RETRY_AFTER_FAILURE_HOURS = 6;

const HOUR_MS = 3_600_000;

/**
 * The connections to sync now.
 *
 * @example
 * connectionsDue(connections, { now: new Date() }); // the ones whose day is up
 */
export function connectionsDue<T extends ScheduledConnection>(
  connections: readonly T[],
  options: SyncScheduleOptions,
): T[] {
  const now = options.now.getTime();
  const retryMs = (options.retryAfterFailureHours ?? SYNC_RETRY_AFTER_FAILURE_HOURS) * HOUR_MS;

  return connections.filter((connection) => {
    if (connection.status === 'disabled') return false;

    const lastAttempt = options.lastAttempts?.get(connection.id);
    if (connection.status === 'error' && lastAttempt && now - lastAttempt.getTime() < retryMs) {
      return false;
    }

    if (connection.lastSyncedAt === null) return true;
    const refreshMs = Math.max(1, connection.refreshHours) * HOUR_MS;
    return now - connection.lastSyncedAt.getTime() >= refreshMs;
  });
}
