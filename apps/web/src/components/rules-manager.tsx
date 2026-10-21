'use client';

import { useCallback, useState } from 'react';

import { toMinorUnits } from '@moneytracker/core';

import { CategoryMenu, type PickerCategory } from './category-menu.tsx';
import { UndoToast } from './undo-toast.tsx';

/** A rule as the screen sees it. */
export interface RuleView {
  id: string;
  name: string;
  categoryId: string;
  priority: number;
  enabled: boolean;
  matchMerchant: string | null;
  matchDescriptionPattern: string | null;
  minAmountMinor: number | null;
  maxAmountMinor: number | null;
  accountId: string | null;
  matchedCount: number;
}

/** An account a rule can be limited to. */
export interface RuleAccount {
  id: string;
  name: string;
}

/** What a rule would do to the existing data. */
interface Preview {
  matched: number;
  wouldChange: number;
  locked: number;
}

/** The fields of a rule, as the form holds them. */
interface RuleDraft {
  name: string;
  categoryId: string;
  matchMerchant: string;
  matchDescriptionPattern: string;
  minAmount: string;
  maxAmount: string;
  accountId: string;
}

function emptyDraft(): RuleDraft {
  return {
    name: '',
    categoryId: '',
    matchMerchant: '',
    matchDescriptionPattern: '',
    minAmount: '',
    maxAmount: '',
    accountId: '',
  };
}

function draftFromRule(rule: RuleView): RuleDraft {
  return {
    name: rule.name,
    categoryId: rule.categoryId,
    matchMerchant: rule.matchMerchant ?? '',
    matchDescriptionPattern: rule.matchDescriptionPattern ?? '',
    minAmount: rule.minAmountMinor === null ? '' : (rule.minAmountMinor / 100).toFixed(2),
    maxAmount: rule.maxAmountMinor === null ? '' : (rule.maxAmountMinor / 100).toFixed(2),
    accountId: rule.accountId ?? '',
  };
}

/**
 * The rules screen.
 *
 * Rules decide categories. Every change re-categorizes the transactions the
 * rules reach, and the screen says how many changed.
 */
export function RulesManager({
  initialRules,
  categories,
  accounts,
}: {
  initialRules: RuleView[];
  categories: PickerCategory[];
  accounts: RuleAccount[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdRuleId, setCreatedRuleId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Reloads the rules, with the match counts the server knows. */
  const refreshRules = useCallback(async () => {
    try {
      const response = await fetch('/api/rules');
      if (!response.ok) return;
      const result = (await response.json()) as { rules: RuleView[] };
      setRules(result.rules);
    } catch {
      // The list on screen stays as it is.
    }
  }, []);

  /** Asks the server what a rule would do. */
  const refreshPreview = useCallback(async (next: RuleDraft) => {
    if (!next.categoryId) {
      setPreview(null);
      return;
    }

    try {
      const response = await fetch('/api/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: next.name || 'Preview',
          categoryId: next.categoryId,
          matchMerchant: next.matchMerchant || null,
          matchDescriptionPattern: next.matchDescriptionPattern || null,
          minAmountMinor: next.minAmount ? toMinorUnits(Number(next.minAmount)) : null,
          maxAmountMinor: next.maxAmount ? toMinorUnits(Number(next.maxAmount)) : null,
          accountId: next.accountId || null,
        }),
      });
      if (!response.ok) return;
      const result = (await response.json()) as { preview: Preview };
      setPreview(result.preview);
    } catch {
      setPreview(null);
    }
  }, []);

  const updateDraft = (next: RuleDraft) => {
    setDraft(next);
    void refreshPreview(next);
  };

  /** Saves a rule, then re-categorizes. */
  const saveRule = async (next: RuleDraft, ruleId?: string) => {
    setBusy(true);
    try {
      const body = {
        name: next.name || 'Untitled rule',
        categoryId: next.categoryId,
        matchMerchant: next.matchMerchant || null,
        matchDescriptionPattern: next.matchDescriptionPattern || null,
        minAmountMinor: next.minAmount ? toMinorUnits(Number(next.minAmount)) : null,
        maxAmountMinor: next.maxAmount ? toMinorUnits(Number(next.maxAmount)) : null,
        accountId: next.accountId || null,
      };

      const response = await fetch(ruleId ? `/api/rules/${ruleId}` : '/api/rules', {
        method: ruleId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error('The server refused the rule');
      const result = (await response.json()) as {
        rule: RuleView;
        applied: { changed: number; scanned: number; skipped: number };
      };

      setDraft(null);
      await refreshRules();
      setEditingId(null);
      setPreview(null);
      setCreatedRuleId(ruleId ? null : result.rule.id);
      setMessage(
        `${result.applied.changed} transaction${result.applied.changed === 1 ? '' : 's'} updated` +
          (result.applied.skipped > 0 ? `, ${result.applied.skipped} manual edit left alone` : ''),
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the rule');
    } finally {
      setBusy(false);
    }
  };

  /** Removes a rule. The transactions it used to reach fall back. */
  const deleteRule = async (ruleId: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('The server refused the delete');
      const result = (await response.json()) as { applied: { changed: number } };

      setRules((current) => current.filter((rule) => rule.id !== ruleId));
      await refreshRules();
      setCreatedRuleId(ruleId);
      setMessage(`Rule deleted, ${result.applied.changed} transactions re-categorized`);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the rule');
    } finally {
      setBusy(false);
    }
  };

  /** Undo: puts a deleted rule back. */
  const undoDelete = async () => {
    const rule = rules.find((item) => item.id === createdRuleId);
    if (!rule) return;
    // The rule is gone from the list, so rebuild it from the draft we kept.
    const draft = draftFromRule(rule);
    setCreatedRuleId(null);
    setMessage(null);
    await saveRule(draft, undefined);
  };

  /** Moves a rule up or down the priority list. */
  const moveRule = async (ruleId: string, direction: -1 | 1) => {
    const ordered = [...rules].sort((a, b) => a.priority - b.priority);
    const index = ordered.findIndex((rule) => rule.id === ruleId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= ordered.length) return;

    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved!);

    setRules(ordered.map((rule, position) => ({ ...rule, priority: (position + 1) * 10 })));

    try {
      await fetch('/api/rules/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ordered.map((rule) => rule.id) }),
      });
      await refreshRules();
      setError(null);
    } catch {
      setError('Could not save the new order');
    }
  };

  /** Turns a rule off or on. */
  const toggleRule = async (rule: RuleView) => {
    const enabled = !rule.enabled;
    setRules((current) =>
      current.map((item) => (item.id === rule.id ? { ...item, enabled } : item)),
    );

    try {
      const response = await fetch(`/api/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error('The server refused the change');
      const result = (await response.json()) as { applied: { changed: number } };
      await refreshRules();
      setMessage(`${result.applied.changed} transactions updated`);
      setError(null);
    } catch (cause) {
      setRules((current) =>
        current.map((item) => (item.id === rule.id ? { ...item, enabled: !enabled } : item)),
      );
      setError(cause instanceof Error ? cause.message : 'Could not change the rule');
    }
  };

  const ordered = [...rules].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-3">
      {draft && !editingId && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">New rule</h3>

          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Name</span>
              <input
                value={draft.name}
                onChange={(event) => updateDraft({ ...draft, name: event.target.value })}
                placeholder="Shell → Gas"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <div>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Category
              </span>
              <div className="mt-1">
                <CategoryMenu
                  categories={categories}
                  value={draft.categoryId || null}
                  label="Category for the rule"
                  onSelect={(categoryId) => updateDraft({ ...draft, categoryId })}
                />
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Merchant contains
              </span>
              <input
                value={draft.matchMerchant}
                onChange={(event) => updateDraft({ ...draft, matchMerchant: event.target.value })}
                placeholder="shell"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Description matches
              </span>
              <input
                value={draft.matchDescriptionPattern}
                onChange={(event) =>
                  updateDraft({ ...draft, matchDescriptionPattern: event.target.value })
                }
                placeholder="^SHELL"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Amount from
                </span>
                <input
                  inputMode="decimal"
                  value={draft.minAmount}
                  onChange={(event) => updateDraft({ ...draft, minAmount: event.target.value })}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Amount to
                </span>
                <input
                  inputMode="decimal"
                  value={draft.maxAmount}
                  onChange={(event) => updateDraft({ ...draft, maxAmount: event.target.value })}
                  placeholder="100.00"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Account
              </span>
              <select
                value={draft.accountId}
                onChange={(event) => updateDraft({ ...draft, accountId: event.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Any account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>

            {preview && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Matches {preview.matched} transaction{preview.matched === 1 ? '' : 's'},{' '}
                {preview.wouldChange} would change
                {preview.locked > 0 ? `, ${preview.locked} manual edit left alone` : ''}.
              </p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy || !draft.categoryId}
              onClick={() => void saveRule(draft)}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              Save rule
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setPreview(null);
              }}
              className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {ordered.length === 0 && !draft && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">No rules yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Rules are how you tell the app what a merchant is. They always beat the bank&apos;s
            guess.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {ordered.map((rule, index) => (
          <li
            key={rule.id}
            className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            {editingId === rule.id ? (
              <RuleEditForm
                rule={rule}
                categories={categories}
                accounts={accounts}
                busy={busy}
                onCancel={() => {
                  setEditingId(null);
                  setPreview(null);
                }}
                onSave={(next) => void saveRule(next, rule.id)}
                onPreview={refreshPreview}
              />
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() => void toggleRule(rule)}
                    aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`truncate text-sm font-semibold ${
                          rule.enabled
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-400 line-through'
                        }`}
                      >
                        {rule.name}
                      </p>
                      <CategoryMenu
                        categories={categories}
                        value={rule.categoryId}
                        label={`Category for ${rule.name}`}
                        onSelect={(categoryId) =>
                          void saveRule({ ...draftFromRule(rule), categoryId }, rule.id)
                        }
                      />
                    </div>

                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {describeRule(rule)}
                    </p>

                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {rule.matchedCount} transaction{rule.matchedCount === 1 ? '' : 's'} match
                    </p>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => void moveRule(rule.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${rule.name} up`}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => void moveRule(rule.id, 1)}
                    disabled={index === ordered.length - 1}
                    aria-label={`Move ${rule.name} down`}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(rule.id);
                      setPreview(null);
                    }}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRule(rule.id)}
                    className="ml-auto rounded-lg px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {!draft && (
        <button
          type="button"
          onClick={() => {
            setDraft(emptyDraft());
            setPreview(null);
          }}
          className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Add a rule
        </button>
      )}

      {error && <UndoToast message={error} tone="error" onDismiss={() => setError(null)} />}
      {!error && message && (
        <UndoToast
          message={message}
          onUndo={createdRuleId ? () => void undoDelete() : undefined}
          onDismiss={() => {
            setMessage(null);
            setCreatedRuleId(null);
          }}
        />
      )}
    </div>
  );
}

/** The inline form used when editing an existing rule. */
function RuleEditForm({
  rule,
  categories,
  accounts,
  busy,
  onSave,
  onCancel,
  onPreview,
}: {
  rule: RuleView;
  categories: PickerCategory[];
  accounts: RuleAccount[];
  busy: boolean;
  onSave: (draft: RuleDraft) => void;
  onCancel: () => void;
  onPreview: (draft: RuleDraft) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>(() => draftFromRule(rule));

  const update = (next: RuleDraft) => {
    setDraft(next);
    onPreview(next);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Edit rule</h3>

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Name</span>
          <input
            value={draft.name}
            onChange={(event) => update({ ...draft, name: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <div>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Category</span>
          <div className="mt-1">
            <CategoryMenu
              categories={categories}
              value={draft.categoryId || null}
              label="Category for the rule"
              onSelect={(categoryId) => update({ ...draft, categoryId })}
            />
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Merchant contains
          </span>
          <input
            value={draft.matchMerchant}
            onChange={(event) => update({ ...draft, matchMerchant: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Description matches
          </span>
          <input
            value={draft.matchDescriptionPattern}
            onChange={(event) => update({ ...draft, matchDescriptionPattern: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Amount from
            </span>
            <input
              inputMode="decimal"
              value={draft.minAmount}
              onChange={(event) => update({ ...draft, minAmount: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Amount to
            </span>
            <input
              inputMode="decimal"
              value={draft.maxAmount}
              onChange={(event) => update({ ...draft, maxAmount: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Account</span>
          <select
            value={draft.accountId}
            onChange={(event) => update({ ...draft, accountId: event.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">Any account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy || !draft.categoryId}
          onClick={() => onSave(draft)}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Describes what a rule matches, in words. */
function describeRule(rule: RuleView): string {
  const parts: string[] = [];

  if (rule.matchMerchant) parts.push(`merchant contains "${rule.matchMerchant}"`);
  if (rule.matchDescriptionPattern)
    parts.push(`description matches ${rule.matchDescriptionPattern}`);
  if (rule.minAmountMinor !== null || rule.maxAmountMinor !== null) {
    const from = rule.minAmountMinor === null ? 'any' : (rule.minAmountMinor / 100).toFixed(2);
    const to = rule.maxAmountMinor === null ? 'any' : (rule.maxAmountMinor / 100).toFixed(2);
    parts.push(`amount ${from} to ${to}`);
  }
  if (rule.accountId) parts.push('one account');

  return parts.length > 0 ? parts.join(' · ') : 'Matches everything';
}
