'use client';

import { useEffect, useRef } from 'react';

import { FeatureArtwork } from './artwork.tsx';
import { appScreens } from './data.ts';
import { SectionHeading } from './section-heading.tsx';

export function HorizontalGallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!section || !track || !viewport) return;

    const desktop = window.matchMedia('(min-width: 768px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposeEnhanced: () => void = () => undefined;

    const configure = () => {
      disposeEnhanced();
      section.dataset.enhanced = 'false';
      section.style.removeProperty('height');
      track.style.removeProperty('transform');

      if (!desktop.matches || reducedMotion.matches) {
        disposeEnhanced = () => undefined;
        return;
      }

      section.dataset.enhanced = 'true';
      let frame = 0;
      let start = 0;
      let distance = 0;
      let travel = 1;

      const update = () => {
        frame = 0;
        const progress = Math.max(0, Math.min(1, (window.scrollY - start) / travel));
        track.style.transform = `translate3d(${-distance * progress}px, 0, 0)`;
      };
      const requestUpdate = () => {
        if (!frame) frame = window.requestAnimationFrame(update);
      };
      const measure = () => {
        track.style.transform = 'translate3d(0, 0, 0)';
        distance = Math.max(0, track.scrollWidth - window.innerWidth);
        section.style.height = `${window.innerHeight + distance}px`;
        start = section.getBoundingClientRect().top + window.scrollY;
        travel = Math.max(1, section.offsetHeight - window.innerHeight);
        requestUpdate();
      };
      const onKeyDown = (event: KeyboardEvent) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const current = Math.max(0, Math.min(1, (window.scrollY - start) / travel));
        const step = 1 / Math.max(1, appScreens.length - 1);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? 1
              : Math.max(0, Math.min(1, current + (event.key === 'ArrowRight' ? step : -step)));
        window.scrollTo({ top: start + next * travel, behavior: 'smooth' });
      };

      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(track);
      window.addEventListener('scroll', requestUpdate, { passive: true });
      window.addEventListener('resize', measure, { passive: true });
      viewport.addEventListener('keydown', onKeyDown);
      measure();

      disposeEnhanced = () => {
        window.cancelAnimationFrame(frame);
        resizeObserver.disconnect();
        window.removeEventListener('scroll', requestUpdate);
        window.removeEventListener('resize', measure);
        viewport.removeEventListener('keydown', onKeyDown);
      };
    };

    configure();
    desktop.addEventListener('change', configure);
    reducedMotion.addEventListener('change', configure);
    return () => {
      disposeEnhanced();
      desktop.removeEventListener('change', configure);
      reducedMotion.removeEventListener('change', configure);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="gallery"
      className="gallery section-shell"
      aria-labelledby="gallery-title"
      data-enhanced="false"
    >
      <div className="gallery__sticky">
        <div className="gallery__heading">
          <SectionHeading
            eyebrow="Inside the app"
            title={
              <span id="gallery-title">
                One place. <em>Every answer.</em>
              </span>
            }
            aside="A look at the screens that turn accounts, transactions and plans into an ordinary, legible habit."
          />
        </div>
        <div
          ref={viewportRef}
          className="gallery__viewport"
          role="region"
          aria-label="MoneyTracker screens. Scroll the page, or use left and right arrow keys to explore."
          tabIndex={0}
        >
          <ol ref={trackRef} className="gallery__track">
            {appScreens.map((screen, index) => (
              <li key={screen.title} className="gallery-card">
                <article aria-labelledby={`gallery-piece-${index}`}>
                  <div className="gallery-card__art">
                    <FeatureArtwork variant={screen.variant} id={`gallery-art-${index}`} />
                    <span className="gallery-card__index" aria-hidden="true">
                      / 0{index + 1}
                    </span>
                  </div>
                  <div className="gallery-card__body">
                    <div>
                      <p>{screen.category}</p>
                      <h3 id={`gallery-piece-${index}`}>{screen.title}</h3>
                    </div>
                    <p>{screen.description}</p>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
        <div className="gallery__progress" aria-hidden="true">
          <span>Scroll through the app</span>
          <span>← &nbsp; Arrow keys &nbsp; →</span>
        </div>
      </div>
    </section>
  );
}
