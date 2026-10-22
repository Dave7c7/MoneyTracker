'use client';

import { useCallback, useState } from 'react';

import { formatAmount } from './money.tsx';

/** A budget and what happened against it. */
export interface BudgetStatusView {
  categoryId: string;
  categoryName: string;
  budgetMinor: number;
  spentMinor: number;
  carriedMinor: number;
  effectiveBudgetMinor: number;
  remainingMinor: number;
  percentUsed: number;
  overBudget: boolean;
}

/** A category a budget can be set for. */
export interface BudgetCategory {
  id: string;
  name: string;
}

/** A budget as it is stored, so the screen can remove it. */
export interface BudgetRowView {
  id: string;
  categoryId: string;
}

/**
 * The budgets screen.
 *
 * A budget is a limit the user set. The app shows what was spent against it
 * and what is left, and never changes the limit itself.
 */
export function BudgetsManager({
  initialStatus,
  budgets,
  categories,
}: {
  initialStatus: BudgetStatusView[];
  budgets: BudgetRowView[];
  categories: BudgetCategory[];
}) {
  const [status, setStatus] = useState(initialStatus);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [rollover, setRollover] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Reloads the budgets and what was spent against them. */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/budgets');
      if (!response.ok) return;
      const result = (await response.json()) as { status: BudgetStatusView[] };
      setStatus(result.status);
    } catch {
      // The list on screen stays as it is.
    }
  }, []);

  /** Sets the budget for a category. */
  const save = useCallback(async () => {
    setError(null);
    const amountMinor = Math.round(Number(amount.replace(',', '.')) * 100);
    if (!categoryId) {
      setError('Pick a category.');
      return;
    }
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError('Enter the limit as a number, for example 250.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, amountMinor, rollover }),
      });
      if (!response.ok) {
        setError('The budget could not be saved.');
        setBusy(false);
        return;
      }
      setAmount('');
      setMessage('The budget was saved.');
      await refresh();
    } catch {
      setError('The budget could not be saved.');
    }
    setBusy(false);
  }, [amount, categoryId, refresh, rollover]);

  /** Removes a budget. */
  const remove = useCallback(
    async (categoryId: string) => {
      setError(null);
      const row = budgets.find((entry) => entry.categoryId === categoryId);
      if (!row) return;

      try {
        const response = await fetch(`/api/budgets?id=${encodeURIComponent(row.id)}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          setError('The budget could not be removed.');
          return;
        }
        setStatus((current) => current.filter((entry) => entry.categoryId !== categoryId));
        setMessage('The budget was removed.');
      } catch {
        setError('The budget could not be removed.');
      }
    },
    [budgets],
  );

  const budgeted = status.reduce((sum, entry) => sum + entry.effectiveBudgetMinor, 0);
  const spent = status.reduce((sum, entry) => sum + entry.spentMinor, 0);
  const over = status.filter((entry) => entry.overBudget).length;

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

      <div className="grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Budgeted
          </p>
          <p className="tabular mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatAmount(budgeted)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Spent
          </p>
          <p className="tabular mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatAmount(spent)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Over
          </p>
          <p className="tabular mt-0.5 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {over}
          </p>
        </div>
      </div>

      {status.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No budgets yet. Set one below and the app will keep track of it.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {status.map((entry) => (
            <li
              key={entry.categoryId}
              className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {entry.categoryName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatAmount(entry.spentMinor)} of {formatAmount(entry.effectiveBudgetMinor)}
                    {entry.carriedMinor > 0 &&
                      ` · ${formatAmount(entry.carriedMinor)} carried over`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`tabular text-sm font-medium ${
                      entry.overBudget
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {entry.overBudget
                      ? `${formatAmount(-entry.remainingMinor)} over`
                      : `${formatAmount(entry.remainingMinor)} left`}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(entry.categoryId)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div
                className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="img"
                aria-label={`${entry.categoryName}: ${entry.percentUsed} percent of the budget used`}
              >
                <div
                  className={`h-full rounded-full ${
                    entry.overBudget
                      ? 'bg-rose-500'
                      : entry.percentUsed > 80
                        ? 'bg-amber-500'
                        : 'bg-brand-500'
                  }`}
                  style={{ width: `${Math.min(100, entry.percentUsed)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="set-budget-heading" className="space-y-2.5">
        <h3
          id="set-budget-heading"
          className="text-sm font-semibold text-slate-900 dark:text-slate-100"
        >
          Set a budget
        </h3>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Category
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
            Limit for the month
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="250"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="mt-2.5 flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={rollover}
              onChange={(event) => setRollover(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
            />
            Roll what is left over into next month
          </label>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? 'Saving…' : 'Save the budget'}
          </button>
        </div>
      </section>
    </div>
  );
}
