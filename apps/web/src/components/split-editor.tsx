'use client';

import { useCallback, useMemo, useState } from 'react';

import { splitEvenly, splitRemainder, toMinorUnits } from '@moneytracker/core';

import type { PickerCategory } from './category-menu.tsx';
import { Money } from './money.tsx';

/** A part of a split, as the editor holds it. */
interface Part {
  categoryId: string;
  /** The amount as the user types it, in dollars. */
  amount: string;
}

/**
 * The split editor.
 *
 * A charge can be more than one thing. The parts have to add up to the
 * whole, and the editor says how much is left before anything is saved.
 */
export function SplitEditor({
  transactionId,
  amountMinor,
  currency,
  categories,
  initialLines,
  onSaved,
  onCancel,
}: {
  transactionId: string;
  amountMinor: number;
  currency: string;
  categories: PickerCategory[];
  initialLines: { categoryId: string; amountMinor: number }[];
  onSaved: (lines: { categoryId: string; amountMinor: number }[]) => void;
  onCancel: () => void;
}) {
  const sign = amountMinor < 0 ? -1 : 1;
  const spendable = categories.filter((category) => category.kind !== 'transfer');
  // Money that left the account is spending, so it starts in a spending
  // category. Money that arrived starts in an income category.
  const kind = amountMinor < 0 ? 'spending' : 'income';
  const preferred = spendable.filter((category) => category.kind === kind);
  const defaults = preferred.length > 0 ? preferred : spendable;

  const [parts, setParts] = useState<Part[]>(() => {
    if (initialLines.length >= 2) {
      return initialLines.map((line) => ({
        categoryId: line.categoryId,
        amount: toAmountText(Math.abs(line.amountMinor)),
      }));
    }
    const half = Math.floor(Math.abs(amountMinor) / 2);
    return [
      { categoryId: defaults[0]?.id ?? '', amount: toAmountText(half) },
      {
        categoryId: defaults[1]?.id ?? defaults[0]?.id ?? '',
        amount: toAmountText(Math.abs(amountMinor) - half),
      },
    ];
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const minorParts = useMemo(
    () =>
      parts.map((part) => ({
        categoryId: part.categoryId,
        amountMinor: sign * Math.abs(toMinorAmount(part.amount)),
      })),
    [parts, sign],
  );

  const remainder = useMemo(
    () => splitRemainder(minorParts, amountMinor),
    [minorParts, amountMinor],
  );

  const balanced = remainder === 0;
  const ready = balanced && minorParts.length >= 2 && minorParts.every((part) => part.categoryId);

  /** Adds a part. */
  const addPart = useCallback(() => {
    setParts((current) => [
      ...current,
      { categoryId: spendable[current.length % spendable.length]?.id ?? '', amount: '' },
    ]);
  }, [spendable]);

  /** Removes a part. */
  const removePart = useCallback((index: number) => {
    setParts((current) => current.filter((_, position) => position !== index));
  }, []);

  /** Spits the amount into equal parts. */
  const splitEvenlyInto = useCallback(
    (count: number) => {
      const partsAmount = splitEvenly(amountMinor, count);
      setParts((current) => {
        const next = [...current];
        for (let index = 0; index < count; index += 1) {
          const categoryId = next[index]?.categoryId ?? spendable[index]?.id ?? '';
          next[index] = {
            categoryId,
            amount: toAmountText(Math.abs(partsAmount[index] ?? 0)),
          };
        }
        return next.slice(0, count);
      });
    },
    [amountMinor, spendable],
  );

  /** Saves the split. */
  const save = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/transactions/${transactionId}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: minorParts }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? 'The split could not be saved.');
        return;
      }

      onSaved(minorParts);
    } catch {
      setError('The split could not be saved.');
    } finally {
      setBusy(false);
    }
  }, [minorParts, onSaved, ready, transactionId]);

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
        Split this transaction
      </p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        The whole is <Money amountMinor={amountMinor} currency={currency} className="font-medium" />
        . The parts have to add up to it.
      </p>

      <ul className="mt-2 space-y-2">
        {parts.map((part, index) => (
          <li key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={part.categoryId}
              aria-label={`Category of part ${index + 1}`}
              onChange={(event) =>
                setParts((current) =>
                  current.map((item, position) =>
                    position === index ? { ...item, categoryId: event.target.value } : item,
                  ),
                )
              }
              className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 sm:flex-1 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Choose a category</option>
              {spendable.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={part.amount}
                aria-label={`Amount of part ${index + 1}`}
                placeholder="0.00"
                onChange={(event) =>
                  setParts((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, amount: event.target.value } : item,
                    ),
                  )
                }
                className="tabular w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-800 sm:w-24 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />

              <button
                type="button"
                onClick={() => removePart(index)}
                aria-label={`Remove part ${index + 1}`}
                className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700"
                disabled={parts.length <= 2}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addPart}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          Add a part
        </button>
        <button
          type="button"
          onClick={() => splitEvenlyInto(2)}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          Two halves
        </button>
        <button
          type="button"
          onClick={() => splitEvenlyInto(3)}
          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          Three parts
        </button>
      </div>

      <p
        className={`mt-2 text-xs ${
          balanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
        }`}
      >
        {balanced
          ? 'The parts add up to the whole.'
          : `${toAmountText(Math.abs(remainder))} left to split.`}
      </p>

      {error && (
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!ready || busy}
          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {busy ? 'Saving...' : 'Save the split'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** An amount in dollars, as the input holds it. */
function toAmountText(amountMinor: number): string {
  const cents = Math.abs(amountMinor);
  const units = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? `${units}` : `${units}.${String(rest).padStart(2, '0')}`;
}

/** Reads an amount from the input, in minor units. */
function toMinorAmount(text: string): number {
  const value = Number.parseFloat(text.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(value)) return 0;
  return toMinorUnits(value);
}
