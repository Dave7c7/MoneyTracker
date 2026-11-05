import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'MoneyTracker',
    template: '%s · MoneyTracker',
  },
  description:
    'Self-hosted personal finance tracker: every account, category and goal in one calm, explainable view.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#08090b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-app="loading">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html:
              "[data-boot-warning]{display:none}html[data-app='loading'] [data-boot-warning]{display:block}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
