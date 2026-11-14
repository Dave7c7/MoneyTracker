import type { MetadataRoute } from 'next';

/**
 * The web app manifest. Makes the app installable on phones and desktops.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MoneyTracker',
    short_name: 'MoneyTracker',
    description: 'Self-hosted personal finance tracker.',
    start_url: '/overview',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f5f6f2',
    theme_color: '#090c0a',
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
