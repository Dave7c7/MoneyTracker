'use client';

import { useCallback, useState } from 'react';

import { toMinorUnits } from '@moneytracker/core';

import { CategoryMenu, type PickerCategory } from './category-menu.tsx';
import { Money } from './money.tsx';
import { UndoToast } from './undo-toast.tsx';

/** A transaction as the list shows it. */
export interface TransactionListItem {
  id: string;
  accountId: string;
  accountName: string;
  descriptionRaw: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantKey: string | null;
  amountMinor: number;
  currency: string;
  postedDate: string | null;
  pending: boolean;
  categoryId: string | null;
  categoryName: string | null;
  /** The source of the assignment: user_manual, user_rule, bank, ... */
  assignmentSource:
    'user_manual' | 'user_rule' | 'merchant_memory' | 'bank' | 'ai' | 'fallback' | null;
  confidence: number | null;
  reason: string | null;
}

/** The correction prompt, shown after a category is changed by hand. */
interface ScopePrompt {
  transactionId: string;
  merchantKey: string | null;
  merchantName: string;
  categoryId: string;
  categoryName: string;
}

/**
 * The transaction list.
 *
 * Changing a category takes two taps, updates the row straight away, and
 * then offers to do the same for the rest of the merchant.
 */
export function TransactionList({
  initialRows,
  categories,
}: {
  initialRows: TransactionListItem[];
  categories: PickerCategory[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [prompt, setPrompt] = useState<ScopePrompt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdRuleId, setCreatedRuleId] = useState<string | null>(null);
  const [showAmountRange, setShowAmountRange] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  /** Changes the category of one transaction, by hand. */
  const changeCategory = useCallback(
    async (row: TransactionListItem, categoryId: string) => {
      const category = categories.find((item) => item.id === categoryId);
      const previous = {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        source: row.assignmentSource,
        confidence: row.confidence,
        reason: row.reason,
      };

      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                categoryId,
                categoryName: category?.name ?? item.categoryName,
                assignmentSource: 'user_manual',
                confidence: 1,
                reason: 'Set by you',
              }
            : item,
        ),
      );

      try {
        const response = await fetch(`/api/transactions/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId }),
        });
        if (!response.ok) throw new Error('The server refused the change');

        // Offer to do the same for the rest of the merchant.
        setPrompt({
          transactionId: row.id,
          merchantKey: row.merchantKey,
          merchantName: row.merchantName ?? row.descriptionRaw,
          categoryId,
          categoryName: category?.name ?? 'Uncategorized',
        });
        setError(null);
      } catch (cause) {
        setRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  categoryId: previous.categoryId,
                  categoryName: previous.categoryName,
                  assignmentSource: previous.source,
                  confidence: previous.confidence,
                  reason: previous.reason,
                }
              : item,
          ),
        );
        setError(cause instanceof Error ? cause.message : 'Could not change the category');
      }
    },
    [categories],
  );

  /** Creates a rule that covers the whole merchant. */
  const applyToMerchant = useCallback(
    async (scope: ScopePrompt, range?: { min: string; max: string }) => {
      if (!scope.merchantKey) {
        setPrompt(null);
        return;
      }

      try {
        const response = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${scope.merchantName} → ${scope.categoryName}`,
            categoryId: scope.categoryId,
            matchMerchant: scope.merchantKey,
            minAmountMinor: range?.min ? toMinorUnits(Number(range.min)) : null,
            maxAmountMinor: range?.max ? toMinorUnits(Number(range.max)) : null,
          }),
        });
        if (!response.ok) throw new Error('The server refused the rule');

        const result = (await response.json()) as {
          rule: { id: string };
          applied: { changed: number };
        };

        setCreatedRuleId(result.rule.id);
        setMessage(
          `${result.applied.changed} transaction${result.applied.changed === 1 ? '' : 's'} updated`,
        );
        setPrompt(null);
        setShowAmountRange(false);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create the rule');
      }
    },
    [],
  );

  /** Undo: removes the rule that was just created. */
  const undoRule = useCallback(async () => {
    if (!createdRuleId) return;
    try {
      const response = await fetch(`/api/rules/${createdRuleId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('The server refused the undo');
      setMessage('Rule removed');
      setCreatedRuleId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not undo the rule');
    }
  }, [createdRuleId]);

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {row.merchantName ?? row.descriptionRaw}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {row.merchantName ? row.descriptionRaw : row.accountName}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <CategoryMenu
                    categories={categories}
                    value={row.categoryId}
                    label={`Category for ${row.merchantName ?? row.descriptionRaw}`}
                    onSelect={(categoryId) => void changeCategory(row, categoryId)}
                  />
                  {row.pending ? (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      Pending
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {row.postedDate ? formatDate(row.postedDate) : '—'} · {row.accountName}
                    </span>
                  )}
                </div>

                {row.reason && <p className="mt-1 text-xs italic text-slate-400">{row.reason}</p>}
              </div>

              <Money
                amountMinor={row.amountMinor}
                currency={row.currency}
                className="shrink-0 text-sm font-semibold"
              />
            </div>

            {prompt?.transactionId === row.id && (
              <div className="mt-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm dark:border-brand-900 dark:bg-slate-800">
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  Apply to all from {prompt.merchantName}?
                </p>

                {showAmountRange ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={minAmount}
                        onChange={(event) => setMinAmount(event.target.value)}
                        placeholder="From"
                        aria-label="Amount from"
                        className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <input
                        inputMode="decimal"
                        value={maxAmount}
                        onChange={(event) => setMaxAmount(event.target.value)}
                        placeholder="To"
                        aria-label="Amount to"
                        className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void applyToMerchant(prompt, { min: minAmount, max: maxAmount })
                        }
                        className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
                      >
                        Apply to matching amounts
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAmountRange(false)}
                        className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void applyToMerchant(prompt)}
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
                    >
                      All from this merchant
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAmountRange(true)}
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    >
                      Matching an amount
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrompt(null)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      This one only
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && <UndoToast message={error} tone="error" onDismiss={() => setError(null)} />}
      {!error && message && (
        <UndoToast
          message={message}
          onUndo={createdRuleId ? () => void undoRule() : undefined}
          onDismiss={() => {
            setMessage(null);
            setCreatedRuleId(null);
          }}
        />
      )}
    </div>
  );
}

/** Formats a plain date for display. */
function formatDate(plainDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${plainDate}T00:00:00Z`));
}
