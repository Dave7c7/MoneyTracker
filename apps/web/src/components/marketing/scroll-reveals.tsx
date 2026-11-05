'use client';

import { useEffect } from 'react';

export function ScrollReveals() {
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => {
        element.dataset.revealState = 'visible';
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.revealState = 'visible';
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -7% 0px' },
    );

    elements.forEach((element) => {
      element.dataset.revealState = 'pending';
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
