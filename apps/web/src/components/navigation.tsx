'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The main sections of the app. */
/*
 * Five tabs fit a 360 pixel phone with room to spare. Accounts and rules are
 * one tap away from the overview, which is where they belong: they are set
 * up once, not checked every day.
 */
const links = [
  { href: '/', label: 'Overview', icon: OverviewIcon },
  { href: '/spending', label: 'Spending', icon: SpendingIcon },
  { href: '/cash-flow', label: 'Cash flow', icon: CashFlowIcon },
  { href: '/transactions', label: 'Transactions', icon: TransactionsIcon },
  { href: '/review', label: 'Review', icon: ReviewIcon },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * The primary navigation.
 *
 * A bottom tab bar on phones (thumb reach) and a top bar on desktop.
 */
export function Navigation({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:static md:border-b md:border-t-0 md:bg-transparent md:backdrop-blur-none md:pb-0"
    >
      <ul className="mx-auto flex max-w-5xl items-stretch justify-between px-1 md:justify-start md:gap-1 md:px-0">
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          const Icon = link.icon;
          return (
            <li key={link.href} className="flex-1 md:flex-none">
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium whitespace-nowrap transition-colors md:flex-row md:gap-2 md:py-3 md:text-xs ${
                  active
                    ? 'text-brand-600 dark:text-brand-500'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <span className="relative">
                  <Icon />
                  {link.href === '/review' && reviewCount > 0 && (
                    <span
                      aria-label={`${reviewCount} transactions need review`}
                      className="absolute -right-2 -top-1 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[9px] font-bold leading-4 text-white"
                    >
                      {reviewCount > 99 ? '99+' : reviewCount}
                    </span>
                  )}
                </span>
                <span>{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OverviewIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function SpendingIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M4 19V10" />
      <path d="M10 19V5" />
      <path d="M16 19v-6" />
      <path d="M22 19H2" />
    </svg>
  );
}

function CashFlowIcon() {
  return (
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
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </svg>
  );
}

function TransactionsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
    </svg>
  );
}

function ReviewIcon() {
  return (
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
      <path d="M4 5h16v11H8l-4 3z" />
      <path d="M9 9h6M9 12h4" />
    </svg>
  );
}
