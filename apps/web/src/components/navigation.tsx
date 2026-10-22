'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The main sections of the app. */
/*
 * Five tabs fit a 360 pixel phone with room to spare. Accounts, rules and
 * import are one tap away from the overview, which is where they belong:
 * they are set up once, not checked every day.
 */
const links = [
  { href: '/', label: 'Overview', icon: OverviewIcon },
  { href: '/spending', label: 'Spending', icon: SpendingIcon },
  { href: '/cash-flow', label: 'Cash flow', icon: CashFlowIcon },
  { href: '/transactions', label: 'Transactions', icon: TransactionsIcon },
  { href: '/review', label: 'Review', icon: ReviewIcon },
] as const;

/** The sections that only have room in the top bar. */
const secondaryLinks = [
  { href: '/import', label: 'Import', icon: ImportIcon },
  { href: '/accounts', label: 'Accounts', icon: AccountsIcon },
  { href: '/connections', label: 'Connections', icon: ConnectionsIcon },
  { href: '/subscriptions', label: 'Subscriptions', icon: SubscriptionsIcon },
  { href: '/budgets', label: 'Budgets', icon: BudgetsIcon },
  { href: '/goals', label: 'Goals', icon: GoalsIcon },
  { href: '/rules', label: 'Rules', icon: RulesIcon },
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

        {/*
          The sections that do not fit in a phone tab bar live in the top bar
          on a desktop, and one tap away from the overview on a phone.
        */}
        {secondaryLinks.map((link) => {
          const active = isActive(pathname, link.href);
          const Icon = link.icon;
          return (
            <li key={link.href} className="hidden md:flex-none">
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 px-3 py-3 text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'text-brand-600 dark:text-brand-500'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                <Icon />
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

function ImportIcon() {
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
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

function AccountsIcon() {
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
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  );
}

function RulesIcon() {
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
      <path d="M4 6h10M4 12h16M4 18h7" />
      <circle cx="17" cy="6" r="2" />
    </svg>
  );
}

function SubscriptionsIcon() {
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
      <path d="M4 9a8 8 0 0 1 16 0" />
      <path d="M4 9v5h3l2 6h6l2-6h3V9" />
      <path d="M12 4v5" />
    </svg>
  );
}

function BudgetsIcon() {
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
      <path d="M4 19a9 9 0 1 1 16 0" />
      <path d="M12 19l4-6" />
    </svg>
  );
}

function GoalsIcon() {
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
      <path d="M5 21V4" />
      <path d="M5 5h11l-2 4 2 4H5" />
    </svg>
  );
}

function ConnectionsIcon() {
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
      <path d="M9 7a4 4 0 0 1 4 4" />
      <path d="M5 11a8 8 0 0 1 8-8" />
      <path d="M15 17a4 4 0 0 1-4-4" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="17" r="2" />
    </svg>
  );
}
