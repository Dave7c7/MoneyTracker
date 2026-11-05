import type { Metadata, Viewport } from 'next';

import { AccountLink } from '@/components/account-link.tsx';
import { AlertLink } from '@/components/alert-link.tsx';
import { AppBootCheck } from '@/components/app-boot-check.tsx';
import { Navigation } from '@/components/navigation.tsx';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration.tsx';
import { countNeedsReview, countUnreadAlerts } from '@moneytracker/db';

import { getSessionUserId } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';

export const metadata: Metadata = {
  title: {
    default: 'MoneyTracker',
    template: '%s · MoneyTracker',
  },
  description:
    'Self-hosted personal finance tracker: dashboards, budgets and transparent categorization.',
  applicationName: 'MoneyTracker',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'MoneyTracker',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export default async function MoneyLayout({ children }: { children: React.ReactNode }) {
  const [reviewCount, alertCount] = await Promise.all([countReview(), countAlerts()]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
        <header className="px-4 pb-1 pt-[calc(0.75rem+env(safe-area-inset-top))] md:px-0 md:pt-8">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-2xl">
              MoneyTracker
            </h1>
            <div className="flex items-baseline gap-3">
              <p className="hidden text-sm text-slate-500 dark:text-slate-400 md:block">
                Your money, in the open
              </p>
              <AlertLink count={alertCount} />
              <AccountLink />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 md:px-0 md:pb-12">
          <p
            data-boot-warning
            className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            The scripts of the app did not load, so the charts and the buttons are missing. The
            numbers below are still correct. Reload the page, and if it keeps happening, open it in
            a private window.
          </p>
          {children}
        </main>

        <Navigation reviewCount={reviewCount} alertCount={alertCount} />
      </div>
      <ServiceWorkerRegistration />
      <AppBootCheck />
    </div>
  );
}

async function countAlerts(): Promise<number> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return 0;
    return await countUnreadAlerts(getDatabase().db, userId);
  } catch {
    return 0;
  }
}

async function countReview(): Promise<number> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return 0;
    return await countNeedsReview(getDatabase().db, userId);
  } catch {
    return 0;
  }
}
