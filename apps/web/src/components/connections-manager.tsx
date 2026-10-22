'use client';

import { useCallback, useState } from 'react';

import { formatAmount } from './money.tsx';

/** A connection, as the screen sees it. */
export interface ConnectionView {
  id: string;
  adapterId: string;
  name: string;
  institution: string | null;
  status: 'active' | 'error' | 'disabled';
  lastSyncedAt: string | null;
  lastError: string | null;
  historyDays: number;
  accounts: { id: string; externalId: string; name: string }[];
}

/** An account the provider can reach. */
interface ProviderAccount {
  externalId: string;
  name: string;
  type: string;
  currency: string;
  balanceMinor: number | null;
}

/** How far back to reach. */
const HISTORY_OPTIONS = [
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: 730, label: '2 years' },
];

/**
 * The connections screen.
 *
 * The user pastes the setup token the provider gave them, picks the accounts
 * to keep, and the app brings the transactions in. The credential is stored
 * encrypted, and it is never shown again.
 */
export function ConnectionsManager({
  initialConnections,
  canConnect,
}: {
  initialConnections: ConnectionView[];
  /** False when the app has no encryption key yet. */
  canConnect: boolean;
}) {
  const [connections, setConnections] = useState(initialConnections);
  const [token, setToken] = useState('');
  const [historyDays, setHistoryDays] = useState(90);
  const [pending, setPending] = useState<{
    connectionId: string;
    accounts: ProviderAccount[];
  } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Reloads the connections from the server. */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/connections');
      if (!response.ok) return;
      const result = (await response.json()) as { connections: ConnectionView[] };
      setConnections(result.connections);
    } catch {
      // The list on screen stays as it is.
    }
  }, []);

  /** Connects a bank with the setup token. */
  const connect = useCallback(async () => {
    setError(null);
    setBusy(true);

    try {
      const response = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken: token, historyDays }),
      });
      const result = (await response.json()) as {
        connection?: ConnectionView;
        accounts?: ProviderAccount[];
        error?: string;
      };
      if (!response.ok || !result.connection) {
        setError(result.error ?? 'The bank could not be connected.');
        setBusy(false);
        return;
      }

      setPending({ connectionId: result.connection.id, accounts: result.accounts ?? [] });
      setChosen(new Set((result.accounts ?? []).map((account) => account.externalId)));
      setToken('');
      await refresh();
    } catch {
      setError('The bank could not be connected.');
    }
    setBusy(false);
  }, [historyDays, refresh, token]);

  /** Keeps the chosen accounts and brings the transactions in. */
  const keepAccounts = useCallback(async () => {
    if (!pending) return;
    setError(null);
    setBusy(true);

    try {
      const response = await fetch(`/api/connections/${pending.connectionId}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ externalIds: [...chosen] }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? 'The accounts could not be linked.');
        setBusy(false);
        return;
      }
      setPending(null);
      setMessage('The accounts are connected and the transactions are in.');
      await refresh();
    } catch {
      setError('The accounts could not be linked.');
    }
    setBusy(false);
  }, [chosen, pending, refresh]);

  /** Syncs a connection now. */
  const sync = useCallback(
    async (id: string) => {
      setError(null);
      setMessage(null);
      setBusy(true);
      try {
        const response = await fetch(`/api/connections/${id}/sync`, { method: 'POST' });
        const result = (await response.json()) as {
          error?: string;
          result?: { transactionsInserted: number; transactionsUpdated: number };
        };
        if (!response.ok) {
          setError(result.error ?? 'The sync failed.');
          setBusy(false);
          return;
        }
        setMessage(
          `Synced: ${result.result?.transactionsInserted ?? 0} new transactions, ` +
            `${result.result?.transactionsUpdated ?? 0} updated.`,
        );
        await refresh();
      } catch {
        setError('The sync failed.');
      }
      setBusy(false);
    },
    [refresh],
  );

  /** Removes a connection. */
  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/connections/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('The connection could not be removed.');
        return;
      }
      setConnections((current) => current.filter((connection) => connection.id !== id));
      setMessage('The connection was removed. The accounts stay in the app.');
    } catch {
      setError('The connection could not be removed.');
    }
  }, []);

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {message}
        </p>
      )}

      {connections.length === 0 && !pending && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No bank is connected yet.</p>
      )}

      {connections.length > 0 && (
        <ul className="space-y-2.5">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {connection.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {connection.accounts.length > 0
                      ? connection.accounts.map((account) => account.name).join(', ')
                      : 'No accounts yet'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    connection.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : connection.status === 'error'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {connection.status}
                </span>
              </div>

              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {connection.lastSyncedAt
                  ? `Last synced ${formatDateTime(connection.lastSyncedAt)}`
                  : 'Never synced'}
                {` · reaches back ${connection.historyDays} days`}
              </p>

              {connection.lastError && (
                <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                  {connection.lastError}
                </p>
              )}

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => sync(connection.id)}
                  disabled={busy}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                >
                  Sync now
                </button>
                <button
                  type="button"
                  onClick={() => remove(connection.id)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <section aria-labelledby="pick-heading" className="space-y-2.5">
          <h3
            id="pick-heading"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Pick the accounts to keep
          </h3>
          {pending.accounts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              The provider did not return any accounts for this token.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {pending.accounts.map((account) => (
                <li key={account.externalId}>
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900">
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={chosen.has(account.externalId)}
                        onChange={(event) => {
                          const next = new Set(chosen);
                          if (event.target.checked) next.add(account.externalId);
                          else next.delete(account.externalId);
                          setChosen(next);
                        }}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-100">
                          {account.name}
                        </span>
                        <span className="block text-xs capitalize text-slate-500 dark:text-slate-400">
                          {account.type.replace('_', ' ')}
                        </span>
                      </span>
                    </span>
                    {account.balanceMinor !== null && (
                      <span className="tabular shrink-0 text-slate-600 dark:text-slate-300">
                        {formatAmount(account.balanceMinor, account.currency)}
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={keepAccounts}
              disabled={busy || chosen.size === 0}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {busy ? 'Importing…' : 'Keep these accounts'}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {!pending && (
        <section aria-labelledby="connect-heading" className="space-y-2.5">
          <h3
            id="connect-heading"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Connect a bank
          </h3>

          {!canConnect ? (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              The app has no encryption key yet, so it cannot store a credential. Add one to
              <code className="mx-1">.env</code> and restart it:
              <code className="mt-1 block">openssl rand -hex 32</code>
            </p>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Get a setup token from{' '}
                <a
                  href="https://bridge.simplefin.org/simplefin/create"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-600 hover:underline dark:text-brand-500"
                >
                  SimpleFIN
                </a>
                , then paste it here. The token only works once, and the app never sees your bank
                password.
              </p>
              <label className="mt-2.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Setup token
                <textarea
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  rows={3}
                  placeholder="aHR0cHM6Ly9iZXRhLWJyaWRnZS4uLg=="
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs break-all dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="mt-2.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                How far back to reach
                <select
                  value={historyDays}
                  onChange={(event) => setHistoryDays(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  {HISTORY_OPTIONS.map((option) => (
                    <option key={option.days} value={option.days}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={connect}
                disabled={busy || token.trim().length === 0}
                className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {busy ? 'Connecting…' : 'Connect the bank'}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** A moment in time, the way a person reads it. */
function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 16).replace('T', ' ');
}
