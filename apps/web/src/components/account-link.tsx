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
      className={`finance-nav-link rounded-lg px-2.5 py-2 text-sm font-medium ${
        active ? 'finance-nav-link--active' : ''
      }`}
    >
      Account
    </Link>
  );
}
