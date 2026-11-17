'use client';

import { useMemo, useRef, useState } from 'react';

import { UndoToast } from './undo-toast.tsx';

/** A category as the management screen sees it. */
export interface ManagedCategory {
  id: string;
  name: string;
  kind: 'spending' | 'income' | 'transfer' | 'uncategorized';
  color: string | null;
  parentId: string | null;
  isSystem: boolean;
  transactionCount: number;
  ruleCount: number;
  budgetCount: number;
}

interface Draft {
  name: string;
  kind: 'spending' | 'income';
  parentId: string;
  color: string;
}

const FALLBACK_COLOR = '#94a3b8';

async function send(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : 'The server said no');
  }
  return payload;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * The category manager.
 *
 * New categories go at the top. The list shows the tree: groups first, their
 * children indented underneath. Default categories can be renamed and
 * recoloured; the ones the user made can also be moved and deleted.
 */
export function CategoriesManager({
  initialCategories,
  initialName = '',
}: {
  initialCategories: ManagedCategory[];
  initialName?: string;
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [draft, setDraft] = useState<Draft>({
    name: initialName,
    kind: 'spending',
    parentId: '',
    color: '',
  });
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; moveTo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /** The colour a category had when its picker opened, to save only real changes. */
  const colorAtFocus = useRef<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'neutral' | 'error' } | null>(null);

  const parents = useMemo(
    () =>
      categories.filter(
        (category) =>
          !category.parentId && (category.kind === 'spending' || category.kind === 'income'),
      ),
    [categories],
  );

  const tree = useMemo(() => {
    const topLevel = categories.filter((category) => !category.parentId);
    return topLevel.map((parent) => ({
      parent,
      children: categories.filter((category) => category.parentId === parent.id),
    }));
  }, [categories]);

  const fail = (cause: unknown) =>
    setMessage({
      text: cause instanceof Error ? cause.message : 'Something went wrong',
      tone: 'error',
    });

  const create = async () => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const payload = await send('/api/categories', 'POST', {
        name: draft.name,
        kind: draft.kind,
        parentId: draft.parentId || null,
        ...(draft.color ? { color: draft.color } : {}),
      });
      const created = payload.category as ManagedCategory;
      setCategories((current) => [
        ...current,
        { ...created, transactionCount: 0, ruleCount: 0, budgetCount: 0 },
      ]);
      setDraft({ name: '', kind: draft.kind, parentId: draft.parentId, color: '' });
      setMessage({ text: `Added ${created.name}`, tone: 'neutral' });
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, changes: Partial<Pick<ManagedCategory, 'name' | 'color'>>) => {
    setBusy(true);
    try {
      const payload = await send(`/api/categories/${id}`, 'PATCH', changes);
      const updated = payload.category as ManagedCategory;
      setCategories((current) =>
        current.map((category) =>
          category.id === id
            ? { ...category, name: updated.name, color: updated.color, kind: updated.kind }
            : category,
        ),
      );
      setEditing(null);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category: ManagedCategory, moveTo: string) => {
    setBusy(true);
    try {
      const payload = await send(`/api/categories/${category.id}`, 'DELETE', {
        moveToCategoryId: moveTo || null,
      });
      const movedTransactions = Number(payload.movedTransactions ?? 0);
      const target = categories.find((item) => item.id === moveTo);
      setCategories((current) =>
        current
          .filter((item) => item.id !== category.id)
          .map((item) => (item.parentId === category.id ? { ...item, parentId: null } : item)),
      );
      setDeleting(null);
      setMessage({
        text:
          movedTransactions > 0
            ? `Deleted ${category.name}; ${plural(movedTransactions, 'transaction')} moved to ${target?.name ?? 'Uncategorized'}`
            : `Deleted ${category.name}`,
        tone: 'neutral',
      });
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const draftParent = parents.find((parent) => parent.id === draft.parentId);

  const renderRow = (category: ManagedCategory, nested: boolean) => {
    const isEditing = editing?.id === category.id;
    const isDeleting = deleting?.id === category.id;
    const usage = [
      plural(category.transactionCount, 'transaction'),
      category.ruleCount > 0 ? plural(category.ruleCount, 'rule') : null,
      category.budgetCount > 0 ? plural(category.budgetCount, 'budget') : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <li
        key={category.id}
        className={`py-2.5 ${nested ? 'pl-6' : ''}`}
        data-testid={`category-${category.id}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative h-5 w-5 shrink-0 cursor-pointer">
            <span className="sr-only">Colour for {category.name}</span>
            <span
              aria-hidden="true"
              className="block h-5 w-5 rounded-full border border-black/10"
              style={{ backgroundColor: category.color ?? FALLBACK_COLOR }}
            />
            <input
              type="color"
              value={category.color ?? FALLBACK_COLOR}
              disabled={busy}
              onChange={(event) =>
                setCategories((current) =>
                  current.map((item) =>
                    item.id === category.id ? { ...item, color: event.target.value } : item,
                  ),
                )
              }
              onFocus={(event) => {
                colorAtFocus.current = event.target.value;
              }}
              onBlur={(event) => {
                if (event.target.value !== colorAtFocus.current) {
                  void update(category.id, { color: event.target.value });
                }
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>

          {isEditing ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void update(category.id, { name: editing.name });
              }}
            >
              <input
                autoFocus
                value={editing.name}
                maxLength={60}
                aria-label={`New name for ${category.name}`}
                onChange={(event) => setEditing({ id: category.id, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setEditing(null);
                }}
                className="finance-input finance-input--small min-w-0 flex-1"
              />
              <button
                type="submit"
                disabled={busy || !editing.name.trim()}
                className="finance-button finance-button--primary finance-button--tiny"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="finance-button finance-button--ghost finance-button--tiny"
              >
                Cancel
              </button>
            </form>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {category.name}
                  {category.isSystem ? (
                    <span className="text-[11px] font-normal text-slate-400">Default</span>
                  ) : (
                    <span className="finance-badge !py-0 text-[11px]">Yours</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{usage}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing({ id: category.id, name: category.name })}
                className="finance-button finance-button--ghost finance-button--tiny"
              >
                Rename
              </button>
              {!category.isSystem && (
                <button
                  type="button"
                  onClick={() => setDeleting({ id: category.id, moveTo: '' })}
                  className="finance-button finance-button--ghost finance-button--tiny text-rose-700 dark:text-rose-400"
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>

        {isDeleting && (
          <div className="finance-callout mt-2 space-y-2 text-sm">
            <p className="text-slate-700 dark:text-slate-200">
              Delete <strong>{category.name}</strong>?
              {category.ruleCount > 0 &&
                ` Its ${plural(category.ruleCount, 'rule')} will be deleted too.`}
              {category.budgetCount > 0 &&
                ` Its ${plural(category.budgetCount, 'budget')} will be deleted too.`}
            </p>
            {category.transactionCount > 0 && (
              <label className="block">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Move its {plural(category.transactionCount, 'transaction')} to
                </span>
                <select
                  value={deleting.moveTo}
                  onChange={(event) => setDeleting({ id: category.id, moveTo: event.target.value })}
                  className="finance-input finance-input--small"
                >
                  <option value="">Uncategorized (back to Review)</option>
                  {categories
                    .filter(
                      (item) =>
                        item.id !== category.id &&
                        item.kind !== 'uncategorized' &&
                        item.parentId !== category.id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(category, deleting.moveTo)}
                className="finance-button finance-button--primary finance-button--small !bg-rose-600"
              >
                Delete {category.name}
              </button>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="finance-button finance-button--ghost finance-button--small"
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <form
        className="finance-card space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">New category</h3>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Name</span>
            <input
              value={draft.name}
              maxLength={60}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Rideshare, Pets, Gifts…"
              className="finance-input finance-input--small"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Colour</span>
            <input
              type="color"
              value={draft.color || draftParent?.color || '#0ea5e9'}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
              className="finance-input finance-input--small !h-[38px] !w-16 cursor-pointer !p-1"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Inside group
            </span>
            <select
              value={draft.parentId}
              onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
              className="finance-input finance-input--small"
            >
              <option value="">None: its own group</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset disabled={Boolean(draftParent)}>
            <legend className="text-xs font-medium text-slate-600 dark:text-slate-300">Type</legend>
            <div className="mt-2 flex gap-4 text-sm text-slate-700 dark:text-slate-200">
              {(['spending', 'income'] as const).map((kind) => (
                <label key={kind} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="kind"
                    value={kind}
                    checked={(draftParent?.kind ?? draft.kind) === kind}
                    onChange={() => setDraft({ ...draft, kind })}
                  />
                  {kind === 'spending' ? 'Spending' : 'Income'}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <button
          type="submit"
          disabled={busy || !draft.name.trim()}
          className="finance-button finance-button--primary"
        >
          Add category
        </button>
      </form>

      <div className="finance-card p-4">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {tree.map(({ parent, children }) => (
            <li key={parent.id}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {renderRow(parent, false)}
                {children.map((child) => renderRow(child, true))}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {message && (
        <UndoToast message={message.text} tone={message.tone} onDismiss={() => setMessage(null)} />
      )}
    </div>
  );
}
