'use client';

import { useCallback, useState } from 'react';

import { formatAmount } from './money.tsx';

/** A recurring charge, as the screen sees it. */
export interface RecurringView {
  id: string;
  merchantName: string;
  amountMinor: number;
  currency: string;
  cadence: 'weekly' | 'monthly' | 'annual';
  status: 'detected' | 'confirmed' | 'dismissed';
  nextDate: string;
  priceChanged: boolean;
  previousAmountMinor: number | null;
  occurrences: number;
  /** How sure the app is, 0 to 1. */
  confidence: number;
  reason: string | null;
  isManual: boolean;
}

/** The bills that are expected in the next few weeks. */
export interface UpcomingView {
  id: string;
  merchantName: string;
  amountMinor: number;
  currency: string;
  nextDate: string;
  cadence: 'weekly' | 'monthly' | 'annual';
}

/** A bill the user adds by hand. */
interface BillDraft {
  name: string;
  amount: string;
  cadence: 'weekly' | 'monthly' | 'annual';
  dayOfMonth: string;
  monthOfYear: string;
}

function emptyDraft(): BillDraft {
  return { name: '', amount: '', cadence: 'monthly', dayOfMonth: '1', monthOfYear: '' };
}

/**
 * The subscriptions and bills screen.
 *
 * The app finds what it can and the user decides what is real: a confirmed
 * item is kept, a dismissed one is never brought back.
 */
export function SubscriptionsManager({
  initialItems,
  upcoming,
  today,
}: {
  initialItems: RecurringView[];
  upcoming: UpcomingView[];
  /** Today, as a plain date. */
  today: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [upcomingItems, setUpcomingItems] = useState(upcoming);
  const [draft, setDraft] = useState<BillDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Reloads the list from the server. */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/recurring');
      if (!response.ok) return;
      const result = (await response.json()) as { items: RecurringView[] };
      setItems(result.items);
    } catch {
      // The list on screen stays as it is.
    }
  }, []);

  /** Confirms or dismisses a recurring charge. */
  const setStatus = useCallback(async (id: string, status: 'confirmed' | 'dismissed') => {
    setError(null);
    try {
      const response = await fetch(`/api/recurring/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setError('The change could not be saved.');
        return;
      }
      setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
      if (status === 'dismissed') {
        setUpcomingItems((current) => current.filter((item) => item.id !== id));
      }
      setMessage(status === 'confirmed' ? 'Kept as a recurring charge.' : 'Dismissed.');
    } catch {
      setError('The change could not be saved.');
    }
  }, []);

  /** Removes a recurring charge. */
  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('The charge could not be removed.');
        return;
      }
      setItems((current) => current.filter((item) => item.id !== id));
      setUpcomingItems((current) => current.filter((item) => item.id !== id));
      setMessage('Removed.');
    } catch {
      setError('The charge could not be removed.');
    }
  }, []);

  /** Adds a bill the user knows about. */
  const addBill = useCallback(async () => {
    if (!draft) return;
    setError(null);
    setBusy(true);

    const amountMinor = Math.round(Number(draft.amount.replace(',', '.')) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError('Enter the amount as a number, for example 129.99.');
      setBusy(false);
      return;
    }

    try {
      const response = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          amountMinor,
          currency: 'USD',
          cadence: draft.cadence,
          dayOfMonth: Number(draft.dayOfMonth),
          monthOfYear:
            draft.cadence === 'annual' && draft.monthOfYear ? Number(draft.monthOfYear) : null,
        }),
      });
      if (!response.ok) {
        setError('The bill could not be added.');
        setBusy(false);
        return;
      }
      setDraft(null);
      setMessage('The bill was added.');
      await refresh();
    } catch {
      setError('The bill could not be added.');
    }
    setBusy(false);
  }, [draft, refresh]);

  const detected = items.filter((item) => item.status === 'detected');
  const kept = items.filter((item) => item.status === 'confirmed');

  return (
    <div className="space-y-4">
      {error && <p className="finance-notice finance-notice--error">{error}</p>}
      {message && <p className="finance-notice finance-notice--success">{message}</p>}

      <section aria-labelledby="upcoming-heading">
        <h3
          id="upcoming-heading"
          className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          Due in the next 30 days
        </h3>
        {upcomingItems.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nothing is due in the next 30 days.
          </p>
        ) : (
          <ul className="finance-card divide-y divide-[var(--finance-border)] overflow-hidden">
            {upcomingItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.merchantName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(item.nextDate)} · {cadenceLabel(item.cadence)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isDueSoon(item.nextDate, today) && (
                    <span className="finance-badge uppercase tracking-wide">Due soon</span>
                  )}
                  <span className="tabular text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatAmount(item.amountMinor, item.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detected.length > 0 && (
        <section aria-labelledby="detected-heading">
          <h3
            id="detected-heading"
            className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Needs a look ({detected.length})
          </h3>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            The app found these. Confirm the ones that are real, and dismiss the ones that are not.
          </p>
          <ul className="space-y-2.5">
            {detected.map((item) => (
              <li key={item.id} className="finance-card p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.merchantName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatAmount(item.amountMinor, item.currency)} · {cadenceLabel(item.cadence)}{' '}
                      · next {formatDate(item.nextDate)}
                    </p>
                  </div>
                  {item.priceChanged && (
                    <span className="finance-badge shrink-0 uppercase tracking-wide">
                      Price change
                    </span>
                  )}
                </div>

                {item.reason && (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {item.reason} The app is {Math.round(item.confidence * 100)}% sure.
                  </p>
                )}

                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus(item.id, 'confirmed')}
                    className="finance-button finance-button--primary finance-button--small"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus(item.id, 'dismissed')}
                    className="finance-button finance-button--secondary finance-button--small"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="kept-heading">
        <h3
          id="kept-heading"
          className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          Recurring charges ({kept.length})
        </h3>
        {kept.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing is confirmed yet.</p>
        ) : (
          <ul className="finance-card divide-y divide-[var(--finance-border)] overflow-hidden">
            {kept.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {item.merchantName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {cadenceLabel(item.cadence)} · next {formatDate(item.nextDate)}
                    {item.priceChanged && item.previousAmountMinor !== null
                      ? ` · was ${formatAmount(item.previousAmountMinor, item.currency)}`
                      : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatAmount(item.amountMinor, item.currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="finance-button finance-button--secondary finance-button--small"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-heading">
        <h3
          id="add-heading"
          className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          Add a bill
        </h3>
        {draft === null ? (
          <button
            type="button"
            onClick={() => setDraft(emptyDraft())}
            className="finance-button finance-button--secondary"
          >
            Add a bill the app does not know about
          </button>
        ) : (
          <div className="finance-callout space-y-2.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Name
              <input
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Car insurance"
                className="finance-input finance-input--small"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Amount
              <input
                value={draft.amount}
                onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                inputMode="decimal"
                placeholder="129.99"
                className="finance-input finance-input--small"
              />
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                How often
                <select
                  value={draft.cadence}
                  onChange={(event) =>
                    setDraft({ ...draft, cadence: event.target.value as BillDraft['cadence'] })
                  }
                  className="finance-input finance-input--small"
                >
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                  <option value="annual">Every year</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Day of the month
                <input
                  value={draft.dayOfMonth}
                  onChange={(event) => setDraft({ ...draft, dayOfMonth: event.target.value })}
                  inputMode="numeric"
                  className="finance-input finance-input--small"
                />
              </label>
            </div>
            {draft.cadence === 'annual' && (
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Month of the year
                <input
                  value={draft.monthOfYear}
                  onChange={(event) => setDraft({ ...draft, monthOfYear: event.target.value })}
                  inputMode="numeric"
                  placeholder="1 to 12"
                  className="finance-input finance-input--small"
                />
              </label>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addBill}
                disabled={busy}
                className="finance-button finance-button--primary finance-button--small"
              >
                {busy ? 'Saving…' : 'Add the bill'}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="finance-button finance-button--secondary finance-button--small"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** How often a charge lands, in words. */
function cadenceLabel(cadence: 'weekly' | 'monthly' | 'annual'): string {
  if (cadence === 'weekly') return 'every week';
  if (cadence === 'annual') return 'every year';
  return 'every month';
}

/** Whether a charge lands today or tomorrow. */
function isDueSoon(nextDate: string, today: string): boolean {
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  return nextDate === today || nextDate === tomorrowDate;
}

/** A plain date, the way a person reads it. */
function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[Number(month) - 1]} ${Number(day)}, ${year}`;
}
