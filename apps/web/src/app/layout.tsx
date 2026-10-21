import type { Metadata, Viewport } from 'next';

import './globals.css';

import { Navigation } from '@/components/navigation.tsx';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration.tsx';
import { countNeedsReview, getLocalUser } from '@moneytracker/db';

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
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const reviewCount = await countReview();

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
          <header className="px-4 pb-1 pt-[calc(0.75rem+env(safe-area-inset-top))] md:px-0 md:pt-8">
            {/*
              The header stays small on phones: the status bar and the punch
              hole eat into the top, and the first screen should show money
              rather than branding.
            */}
            <div className="flex items-baseline justify-between gap-4">
              <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100 md:text-2xl">
                MoneyTracker
              </h1>
              <p className="hidden text-sm text-slate-500 dark:text-slate-400 md:block">
                Your money, in the open
              </p>
            </div>
          </header>

          <main className="flex-1 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 md:px-0 md:pb-12">
            {children}
          </main>

          <Navigation reviewCount={reviewCount} />
        </div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}

/**
 * How many transactions are waiting for a decision.
 *
 * A failure here must not take the whole app down, so it falls back to zero.
 */
async function countReview(): Promise<number> {
  try {
    const { db } = getDatabase();
    const user = await getLocalUser(db);
    if (!user) return 0;
    return await countNeedsReview(db, user.id);
  } catch {
    return 0;
  }
}
