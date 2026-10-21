import type { MetadataRoute } from 'next';

/**
 * The web app manifest. Makes the app installable on phones and desktops.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MoneyTracker',
    short_name: 'MoneyTracker',
    description: 'Self-hosted personal finance tracker.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
