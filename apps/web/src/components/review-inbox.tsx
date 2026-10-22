'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatMoney } from '@moneytracker/core';

import { CategoryMenu, type PickerCategory } from './category-menu.tsx';
import { Money } from './money.tsx';
import { UndoToast } from './undo-toast.tsx';

/** One merchant's transactions waiting for a decision. */
export interface ReviewGroupView {
  key: string;
  merchantName: string;
  merchantId: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  totalMinor: number;
  transactions: Array<{
    id: string;
    descriptionRaw: string;
    merchantName: string | null;
    amountMinor: number;
    currency: string;
    postedDate: string | null;
    pending: boolean;
    accountName: string;
    confidence: number | null;
    reason: string | null;
    source: string | null;
  }>;
}

/** An assignment as it was, so an edit can be undone exactly. */
interface PreviousAssignment {
  categoryId: string;
  source:
    | 'user_manual'
    | 'user_rule'
    | 'merchant_memory'
    | 'bank'
    | 'ai'
    | 'transfer_detection'
    | 'fallback';
  confidence: number;
  reason: string;
  locked: boolean;
}

/** A bulk edit that can still be undone. */
interface PendingUndo {
  message: string;
  /** The assignments the transactions had before the edit. */
  previous: Array<{ transactionId: string; assignment: PreviousAssignment | null }>;
  /** The groups that were removed from the list. */
  removed: ReviewGroupView[];
}

/**
 * The review inbox.
 *
 * Transactions are grouped by merchant, so one decision clears many of them.
 * The list updates immediately and rolls back if the server says no.
 */
export function ReviewInbox({
  groups: initialGroups,
  categories,
  needsReview,
}: {
  groups: ReviewGroupView[];
  categories: PickerCategory[];
  needsReview: number;
}) {
  const [groups, setGroups] = useState(initialGroups);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(0);
  const [undo, setUndo] = useState<PendingUndo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);

  const selectedGroups = useMemo(
    () => groups.filter((group) => selected.has(group.key)),
    [groups, selected],
  );

  /**
   * Applies a category to a set of transactions.
   */
  const applyCategory = useCallback(
    async (targets: ReviewGroupView[], categoryId: string, categoryName: string) => {
      if (targets.length === 0) return;

      const transactionIds = targets.flatMap((group) => group.transactions.map((t) => t.id));
      const keys = new Set(targets.map((group) => group.key));
      const removed = groups.filter((group) => keys.has(group.key));

      // Optimistic: the rows disappear straight away.
      setGroups((current) => current.filter((group) => !keys.has(group.key)));
      setSelected((current) => {
        const next = new Set(current);
        for (const key of keys) next.delete(key);
        return next;
      });
      setBusy(true);

      try {
        const response = await fetch('/api/transactions/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactionIds, categoryId }),
        });

        if (!response.ok) throw new Error('The server refused the change');
        const result = (await response.json()) as {
          changed: number;
          previous: Array<{ transactionId: string; assignment: PreviousAssignment | null }>;
        };

        setUndo({
          message: `${result.changed} transaction${result.changed === 1 ? '' : 's'} → ${categoryName}`,
          previous: result.previous,
          removed,
        });
        setError(null);
      } catch (cause) {
        // Roll back: the rows come back and the reason is shown.
        setGroups((current) => [...current, ...removed]);
        setError(cause instanceof Error ? cause.message : 'Could not save the change');
      } finally {
        setBusy(false);
      }
    },
    [groups],
  );

  /**
   * Puts a bulk edit back the way it was.
   */
  const undoChange = useCallback(async () => {
    if (!undo) return;
    const pending = undo;
    setUndo(null);
    setBusy(true);

    try {
      const response = await fetch('/api/transactions/bulk/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previous: pending.previous }),
      });

      if (!response.ok) throw new Error('The server refused the undo');
      setGroups((current) => [...current, ...pending.removed]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not undo the change');
    } finally {
      setBusy(false);
    }
  }, [undo]);

  /**
   * Keyboard shortcuts: the inbox has to be fast to clear on a desktop.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        setFocused((index) => Math.min(index + 1, groups.length - 1));
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        setFocused((index) => Math.max(index - 1, 0));
      } else if (event.key === 'Enter') {
        const group = groups[focused];
        if (group?.suggestedCategoryId) {
          event.preventDefault();
          void applyCategory([group], group.suggestedCategoryId, group.suggestedCategoryName ?? '');
        }
      } else if (event.key === 'x') {
        const group = groups[focused];
        if (!group) return;
        event.preventDefault();
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(group.key)) next.delete(group.key);
          else next.add(group.key);
          return next;
        });
      } else if (event.key === 'u') {
        event.preventDefault();
        void undoChange();
      } else if (event.key === 'Escape') {
        setSelected(new Set());
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [applyCategory, focused, groups, undoChange]);

  useEffect(() => {
    itemRefs.current[focused]?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">All caught up</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {needsReview > 0
            ? `${needsReview} transactions are still waiting for a decision.`
            : 'Nothing needs your attention right now.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {groups.length} {groups.length === 1 ? 'merchant' : 'merchants'} waiting
        </span>
        <span className="hidden sm:inline">
          <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">j</kbd>/
          <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">k</kbd> move ·{' '}
          <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">enter</kbd>{' '}
          confirm ·{' '}
          <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">x</kbd> select
          · <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">u</kbd> undo
        </span>
      </div>

      {selectedGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-900 dark:bg-slate-800">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {selectedGroups.length} selected
          </span>
          <CategoryMenu
            categories={categories}
            value={null}
            label="Choose a category for the selected transactions"
            onSelect={(categoryId) => {
              const name = categories.find((category) => category.id === categoryId)?.name ?? '';
              void applyCategory(selectedGroups, categoryId, name);
            }}
          />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
          >
            Clear
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {groups.map((group, index) => (
          <li
            key={group.key}
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            className={`rounded-2xl border bg-white p-3 shadow-sm transition-colors dark:bg-slate-900 ${
              index === focused
                ? 'border-brand-400 dark:border-brand-500'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(group.key)}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })
                }
                aria-label={`Select ${group.merchantName}`}
                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {group.merchantName}
                  </p>
                  <Money
                    amountMinor={group.totalMinor}
                    className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-200"
                  />
                </div>

                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {group.transactions.length} transaction
                  {group.transactions.length === 1 ? '' : 's'} ·{' '}
                  {group.transactions[0]?.reason ?? 'No reason recorded'}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CategoryMenu
                    categories={categories}
                    value={group.suggestedCategoryId}
                    label={`Category for ${group.merchantName}`}
                    onSelect={(categoryId) => {
                      const name =
                        categories.find((category) => category.id === categoryId)?.name ?? '';
                      void applyCategory([group], categoryId, name);
                    }}
                  />

                  {group.suggestedCategoryId && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void applyCategory(
                          [group],
                          group.suggestedCategoryId!,
                          group.suggestedCategoryName ?? '',
                        )
                      }
                      className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      Confirm {group.suggestedCategoryName}
                    </button>
                  )}
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400">
                    Show {group.transactions.length} transaction
                    {group.transactions.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-2 space-y-1.5 border-l-2 border-slate-100 pl-3 dark:border-slate-800">
                    {group.transactions.map((transaction) => (
                      <li
                        key={transaction.id}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">
                          {transaction.descriptionRaw}
                          <span className="ml-1 text-slate-400">
                            {transaction.accountName}
                            {transaction.pending ? ' · pending' : ''}
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-slate-600 dark:text-slate-300">
                          {formatMoney(transaction.amountMinor, transaction.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {error && <UndoToast message={error} tone="error" onDismiss={() => setError(null)} />}
      {!error && undo && (
        <UndoToast
          message={undo.message}
          onUndo={() => void undoChange()}
          onDismiss={() => setUndo(null)}
        />
      )}
    </div>
  );
}
