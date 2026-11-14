import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import Link from 'next/link';

import { AccountLink } from '@/components/account-link.tsx';
import { AlertLink } from '@/components/alert-link.tsx';
import { AppBootCheck } from '@/components/app-boot-check.tsx';
import { Navigation } from '@/components/navigation.tsx';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration.tsx';
import { countNeedsReview, countUnreadAlerts } from '@moneytracker/db';

import { getSessionUserId } from '@/lib/auth.ts';
import { getDatabase } from '@/lib/db.ts';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

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
    { media: '(prefers-color-scheme: light)', color: '#f5f6f2' },
    { media: '(prefers-color-scheme: dark)', color: '#090c0a' },
  ],
};

export default async function MoneyLayout({ children }: { children: React.ReactNode }) {
  const [reviewCount, alertCount] = await Promise.all([countReview(), countAlerts()]);

  return (
    <div
      data-finance-shell
      className={`${spaceGrotesk.variable} ${plexMono.variable} finance-shell min-h-screen antialiased`}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
        <header className="no-print order-1 px-4 pb-3 pt-[calc(0.875rem+env(safe-area-inset-top))] md:px-0 md:pb-5 md:pt-7">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-base md:text-xl">
              <Link
                href="/overview"
                className="finance-wordmark"
                aria-label="MoneyTracker overview"
              >
                <span className="finance-wordmark__mark" aria-hidden="true">
                  M<span>↗</span>
                </span>
                <span>MoneyTracker</span>
              </Link>
            </h1>
            <div className="flex items-center gap-1.5 sm:gap-3">
              <p className="finance-eyebrow hidden md:block">Your money, in focus</p>
              <AlertLink count={alertCount} />
              <AccountLink />
            </div>
          </div>
        </header>

        <main className="order-2 flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2 md:order-3 md:px-0 md:pb-12 md:pt-5">
          <p data-boot-warning className="finance-notice finance-notice--warning mb-4">
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
