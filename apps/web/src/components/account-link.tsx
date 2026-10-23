'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The way to the account, from anywhere.
 *
 * It sits in the header rather than the tab bar: it is set up once, not
 * checked every day, and it has to be reachable on a phone too. There is
 * nothing to manage before signing in, so it hides itself there.
 */
export function AccountLink() {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  const active = pathname === '/account';

  return (
    <Link
      href="/account"
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-2 py-1 text-sm font-medium transition-colors ${
        active
          ? 'text-brand-600 dark:text-brand-500'
          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
      }`}
    >
      Account
    </Link>
  );
}
