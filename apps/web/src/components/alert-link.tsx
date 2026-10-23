'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The bell, and how many alerts are new.
 *
 * It sits in the header so it is reachable on a phone, where the secondary
 * navigation is hidden. Before signing in there is nothing behind it, so it
 * hides itself there — the same rule as the account link.
 */
export function AlertLink({ count }: { count: number }) {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  const active = pathname === '/alerts';

  return (
    <Link
      href="/alerts"
      aria-current={active ? 'page' : undefined}
      aria-label={
        count > 0 ? `Alerts, ${count} new` : 'Alerts'
      }
      className={`relative rounded-lg p-1.5 transition-colors ${
        active
          ? 'text-brand-600 dark:text-brand-500'
          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
        <path d="M10.5 20a2 2 0 0 0 3 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
