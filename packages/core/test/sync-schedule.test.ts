import { describe, expect, it } from 'vitest';

import { connectionsDue, type ScheduledConnection } from '../src/sync-schedule.ts';

const NOW = new Date('2026-11-28T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

function connection(overrides: Partial<ScheduledConnection> = {}): ScheduledConnection {
  return {
    id: 'c1',
    status: 'active',
    lastSyncedAt: hoursAgo(1),
    refreshHours: 24,
    ...overrides,
  };
}

describe('connectionsDue', () => {
  it('syncs a connection that was never synced', () => {
    const due = connectionsDue([connection({ lastSyncedAt: null })], { now: NOW });
    expect(due).toHaveLength(1);
  });

  it('waits until the refresh interval has passed', () => {
    expect(connectionsDue([connection({ lastSyncedAt: hoursAgo(23) })], { now: NOW })).toEqual([]);
    expect(connectionsDue([connection({ lastSyncedAt: hoursAgo(24) })], { now: NOW })).toHaveLength(
      1,
    );
  });

  it('never syncs a disabled connection', () => {
    const due = connectionsDue([connection({ status: 'disabled', lastSyncedAt: null })], {
      now: NOW,
    });
    expect(due).toEqual([]);
  });

  it('waits after a failed attempt before trying again', () => {
    const failing = connection({ status: 'error', lastSyncedAt: hoursAgo(120) });

    const justTried = new Map([['c1', hoursAgo(2)]]);
    expect(connectionsDue([failing], { now: NOW, lastAttempts: justTried })).toEqual([]);

    const triedLongAgo = new Map([['c1', hoursAgo(6)]]);
    expect(connectionsDue([failing], { now: NOW, lastAttempts: triedLongAgo })).toHaveLength(1);
  });

  it('tries a failing connection at once when the app has not tried it yet', () => {
    // After a restart the app has no attempts in memory: the failure was
    // recorded by an earlier run, so trying once now is right.
    const failing = connection({ status: 'error', lastSyncedAt: hoursAgo(120) });
    expect(connectionsDue([failing], { now: NOW })).toHaveLength(1);
  });

  it('does not hold back a healthy connection that was tried recently', () => {
    const healthy = connection({ lastSyncedAt: hoursAgo(30) });
    const tried = new Map([['c1', hoursAgo(1)]]);
    expect(connectionsDue([healthy], { now: NOW, lastAttempts: tried })).toHaveLength(1);
  });
});
