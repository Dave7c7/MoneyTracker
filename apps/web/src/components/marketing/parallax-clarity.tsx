'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';

export function ParallaxClarity() {
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const bounds = scene.getBoundingClientRect();
      const centerOffset = window.innerHeight / 2 - (bounds.top + bounds.height / 2);
      const shift = Math.max(-42, Math.min(42, centerOffset * 0.065));
      scene.style.setProperty('--clarity-back', `${shift * -0.45}px`);
      scene.style.setProperty('--clarity-front', `${shift * 0.55}px`);
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, []);

  return (
    <div ref={sceneRef} className="clarity-scene" data-reveal>
      <div className="clarity-scene__backdrop" aria-hidden="true" />
      <div className="clarity-scene__frame">
        <Image
          src="/images/moneytracker-dashboard.svg"
          alt="A stylized MoneyTracker overview showing a total balance, a rising cash-flow chart and linked accounts"
          width={900}
          height={1100}
          sizes="(max-width: 767px) 88vw, 42vw"
          className="clarity-scene__image"
        />
      </div>
      <div className="clarity-scene__orbit" aria-hidden="true">
        <span />
      </div>
      <div className="clarity-scene__caption">
        <span>Every account</span>
        <span>One clear view</span>
      </div>
      <div className="clarity-scene__asterisk" aria-hidden="true">
        ✳
      </div>
    </div>
  );
}
