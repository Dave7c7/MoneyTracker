'use client';

import { useEffect, useRef, useState } from 'react';

/** A category the user can pick. */
export interface PickerCategory {
  id: string;
  name: string;
  kind: 'spending' | 'income' | 'transfer' | 'uncategorized';
  color: string | null;
}

/**
 * A category menu.
 *
 * Changing a category takes two taps: open the menu, pick the category.
 * The list is searchable when there are many categories.
 */
export function CategoryMenu({
  categories,
  value,
  onSelect,
  label,
  className = '',
}: {
  categories: PickerCategory[];
  value: string | null;
  onSelect: (categoryId: string) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const current = categories.find((category) => category.id === value);
  const filtered = query
    ? categories.filter((category) => category.name.toLowerCase().includes(query.toLowerCase()))
    : categories;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 ${className}`}
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: current?.color ?? '#94a3b8' }}
        />
        {current?.name ?? 'Uncategorized'}
        <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 opacity-60">
          <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a category"
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No match</li>
            )}
            {filtered.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={category.id === value}
                  onClick={() => {
                    onSelect(category.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color ?? '#94a3b8' }}
                  />
                  <span className="truncate">{category.name}</span>
                  {category.id === value && (
                    <svg aria-hidden="true" viewBox="0 0 12 12" className="ml-auto h-3 w-3">
                      <path
                        d="M2 6.5 4.5 9 10 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
