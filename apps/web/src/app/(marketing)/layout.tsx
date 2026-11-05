import type { Metadata } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';

import './marketing.css';

import { AppBootCheck } from '@/components/app-boot-check.tsx';

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
  title: { absolute: 'MoneyTracker — Your money, in focus' },
  description:
    'Self-hosted personal finance that brings every account, category and goal into one calm, explainable view.',
  applicationName: 'MoneyTracker',
  keywords: [
    'personal finance',
    'self-hosted',
    'budgeting',
    'expense tracking',
    'cash flow',
    'net worth',
  ],
  openGraph: {
    title: 'MoneyTracker — Your money, in focus',
    description: 'Every account, one clear picture. Self-hosted, explainable personal finance.',
    type: 'website',
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className={`${spaceGrotesk.variable} ${plexMono.variable} marketing`}>{children}</div>
      <AppBootCheck />
    </>
  );
}
