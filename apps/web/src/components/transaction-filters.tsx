'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

/** A category that can be filtered on. */
export interface FilterCategory {
  id: string;
  name: string;
}

/** An account that can be filtered on. */
export interface FilterAccount {
  id: string;
  name: string;
}

/**
 * The transaction filters.
 *
 * Filters live in the URL, so a filtered view can be shared and the server
 * does the work.
 */
export function TransactionFilters({
  categories,
  accounts,
  initial,
}: {
  categories: FilterCategory[];
  accounts: FilterAccount[];
  initial: {
    search?: string;
    accountId?: string;
    categoryId?: string;
    from?: string;
    to?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initial.search ?? '');
  const firstRender = useRef(true);

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.replace(`${pathname}${params.size > 0 ? `?${params.toString()}` : ''}`, {
        scroll: false,
      });
    });
  };

  // The search box is debounced so typing does not hammer the server.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (search === (initial.search ?? '')) return;

    const timer = setTimeout(() => update('search', search), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const inputClass =
    'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

  return (
    <div className="space-y-3" aria-busy={isPending}>
      <div className="grid min-w-0 gap-3 ph:grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block min-w-0 ph:col-span-2 lg:col-span-1">
          <span className="sr-only">Search transactions</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search merchant or description"
            className={inputClass}
          />
        </label>

        <label className="block min-w-0">
          <span className="sr-only">Account</span>
          <select
            value={initial.accountId ?? ''}
            onChange={(event) => update('accountId', event.target.value)}
            className={inputClass}
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="sr-only">Category</span>
          <select
            value={initial.categoryId ?? ''}
            onChange={(event) => update('categoryId', event.target.value)}
            className={inputClass}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex min-w-0 items-center gap-2 ph:col-span-2">
          <label className="block min-w-0 flex-1">
            <span className="sr-only">From date</span>
            <input
              type="date"
              value={initial.from ?? ''}
              onChange={(event) => update('from', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block min-w-0 flex-1">
            <span className="sr-only">To date</span>
            <input
              type="date"
              value={initial.to ?? ''}
              onChange={(event) => update('to', event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {searchParams.size > 0 && (
        <button
          type="button"
          onClick={() =>
            startTransition(() => {
              router.replace(pathname, { scroll: false });
            })
          }
          className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-500"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
