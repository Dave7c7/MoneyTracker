'use client';

import { useEffect, useRef } from 'react';

export function TiltGrid({ children }: { children: React.ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-tilt]'));
    const cleanups = cards.map((card) => {
      const surface = card.querySelector<HTMLElement>('.feature-card__surface');
      if (!surface) return () => undefined;

      const reset = () => {
        surface.style.setProperty('--tilt-x', '0deg');
        surface.style.setProperty('--tilt-y', '0deg');
        surface.style.setProperty('--lift', '0px');
      };
      const move = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        const bounds = card.getBoundingClientRect();
        const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
        const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
        surface.style.setProperty('--tilt-x', `${vertical * -7}deg`);
        surface.style.setProperty('--tilt-y', `${horizontal * 8}deg`);
        surface.style.setProperty('--lift', '-5px');
      };

      card.addEventListener('pointermove', move, { passive: true });
      card.addEventListener('pointerleave', reset);
      card.addEventListener('pointercancel', reset);
      return () => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerleave', reset);
        card.removeEventListener('pointercancel', reset);
        reset();
      };
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return (
    <div ref={gridRef} className="feature-grid">
      {children}
    </div>
  );
}
