'use client';

import { useCallback, useState } from 'react';

import { formatAmount } from './money.tsx';

/** A goal and how far it has come. */
export interface GoalView {
  id: string;
  name: string;
  targetMinor: number;
  savedMinor: number;
  accountId: string | null;
  accountName: string | null;
  deadline: string | null;
  percentComplete: number;
  remainingMinor: number;
  reached: boolean;
  daysLeft: number | null;
  neededPerMonthMinor: number | null;
}

/** An account a goal can be linked to. */
export interface GoalAccount {
  id: string;
  name: string;
}

/**
 * The savings goals screen.
 *
 * A goal is tracking only: the app never moves money. A goal linked to an
 * account reads the balance of that account; the others use what the user
 * says they set aside.
 */
export function GoalsManager({
  initialGoals,
  accounts,
}: {
  initialGoals: GoalView[];
  accounts: GoalAccount[];
}) {
  const [goals, setGoals] = useState(initialGoals);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [saved, setSaved] = useState('');
  const [accountId, setAccountId] = useState('');
  const [deadline, setDeadline] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Reloads the goals from the server. */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/goals');
      if (!response.ok) return;
      const result = (await response.json()) as { goals: GoalView[] };
      setGoals(result.goals);
    } catch {
      // The list on screen stays as it is.
    }
  }, []);

  /** Adds a goal. */
  const create = useCallback(async () => {
    setError(null);
    const targetMinor = Math.round(Number(target.replace(',', '.')) * 100);
    const savedMinor = saved.trim() === '' ? 0 : Math.round(Number(saved.replace(',', '.')) * 100);
    if (!name.trim()) {
      setError('Give the goal a name.');
      return;
    }
    if (!Number.isFinite(targetMinor) || targetMinor <= 0) {
      setError('Enter the target as a number, for example 5000.');
      return;
    }
    if (!Number.isFinite(savedMinor) || savedMinor < 0) {
      setError('Enter what you have set aside as a number.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          targetMinor,
          savedMinor,
          accountId: accountId || null,
          deadline: deadline || null,
        }),
      });
      if (!response.ok) {
        setError('The goal could not be saved.');
        setBusy(false);
        return;
      }
      setName('');
      setTarget('');
      setSaved('');
      setDeadline('');
      setMessage('The goal was added.');
      await refresh();
    } catch {
      setError('The goal could not be saved.');
    }
    setBusy(false);
  }, [accountId, deadline, name, refresh, saved, target]);

  /** Records what has been set aside. */
  const updateSaved = useCallback(
    async (goal: GoalView, amount: string) => {
      setError(null);
      const savedMinor = Math.round(Number(amount.replace(',', '.')) * 100);
      if (!Number.isFinite(savedMinor) || savedMinor < 0) {
        setError('Enter what you have set aside as a number.');
        return;
      }

      try {
        const response = await fetch(`/api/goals/${goal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ savedMinor }),
        });
        if (!response.ok) {
          setError('The goal could not be updated.');
          return;
        }
        setMessage('The goal was updated.');
        await refresh();
      } catch {
        setError('The goal could not be updated.');
      }
    },
    [refresh],
  );

  /** Removes a goal. */
  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError('The goal could not be removed.');
        return;
      }
      setGoals((current) => current.filter((goal) => goal.id !== id));
      setMessage('The goal was removed.');
    } catch {
      setError('The goal could not be removed.');
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

      {goals.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No goals yet. Add one below and the app will keep track of it.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {goals.map((goal) => (
            <li
              key={goal.id}
              className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {goal.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatAmount(goal.savedMinor)} of {formatAmount(goal.targetMinor)}
                    {goal.accountName && ` · ${goal.accountName}`}
                    {goal.deadline && ` · by ${goal.deadline}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(goal.id)}
                  className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
                >
                  Remove
                </button>
              </div>

              <div
                className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="img"
                aria-label={`${goal.name}: ${goal.percentComplete} percent of the target reached`}
              >
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, goal.percentComplete)}%` }}
                />
              </div>

              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                {goal.reached
                  ? 'Reached.'
                  : `${formatAmount(goal.remainingMinor)} to go${
                      goal.neededPerMonthMinor !== null
                        ? ` · ${formatAmount(goal.neededPerMonthMinor)} a month`
                        : ''
                    }`}
              </p>

              {!goal.accountId && (
                <SavedInput goal={goal} onSave={(amount) => updateSaved(goal, amount)} />
              )}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="add-goal-heading" className="space-y-2.5">
        <h3
          id="add-goal-heading"
          className="text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          Add a goal
        </h3>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Emergency fund"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Target
              <input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                inputMode="decimal"
                placeholder="5000"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Set aside so far
              <input
                value={saved}
                onChange={(event) => setSaved(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              />
            </label>
          </div>
          <label className="mt-2.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
            Linked account
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">None, I will type what I saved</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
            Deadline
            <input
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? 'Saving…' : 'Add the goal'}
          </button>
        </div>
      </section>
    </div>
  );
}

/** The field where the user says what they have set aside. */
function SavedInput({ goal, onSave }: { goal: GoalView; onSave: (amount: string) => void }) {
  const [amount, setAmount] = useState((goal.savedMinor / 100).toFixed(2));

  return (
    <div className="mt-2.5 flex items-center gap-2">
      <label className="sr-only" htmlFor={`saved-${goal.id}`}>
        What you have set aside for {goal.name}
      </label>
      <input
        id={`saved-${goal.id}`}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        inputMode="decimal"
        className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
      />
      <button
        type="button"
        onClick={() => onSave(amount)}
        className="rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200"
      >
        Save
      </button>
    </div>
  );
}
