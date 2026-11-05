'use client';

import dynamic from 'next/dynamic';

import { SculptureFallback } from './sculpture-fallback.tsx';

const HeroScene = dynamic(() => import('./hero-scene.tsx'), {
  ssr: false,
  loading: () => <SculptureFallback />,
});

export function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <HeroScene />
    </div>
  );
}
