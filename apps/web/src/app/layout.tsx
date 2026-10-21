import type { Metadata, Viewport } from 'next';

import './globals.css';

import { Navigation } from '@/components/navigation.tsx';
import { ServiceWorkerRegistration } from '@/components/service-worker-registration.tsx';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col">
          <header className="px-4 pb-2 pt-5 md:px-0 md:pt-8">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  MoneyTracker
                </p>
                <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
                  Your money, in the open
                </h1>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-28 pt-2 md:px-0 md:pb-12">{children}</main>

          <Navigation />
        </div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
