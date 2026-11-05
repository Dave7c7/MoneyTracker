'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { navigation } from './data.ts';

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 28);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
    if (menuRef.current) menuRef.current.open = false;
  }

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="site-header__inner">
        <Link className="wordmark" href="#top" aria-label="MoneyTracker, back to top">
          <span className="wordmark__mark" aria-hidden="true">
            M<span>↗</span>
          </span>
          <span>MONEYTRACKER</span>
        </Link>

        <nav className="desktop-nav" aria-label="Main">
          <ul>
            {navigation.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link className="header-availability" href="/login">
          <span aria-hidden="true" />
          Open the app
        </Link>

        <details
          ref={menuRef}
          className="mobile-nav"
          onToggle={(event) => setMenuOpen(event.currentTarget.open)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && menuOpen) {
              closeMenu();
              summaryRef.current?.focus();
            }
          }}
        >
          <summary
            ref={summaryRef}
            role="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-controls="mobile-navigation"
            aria-expanded={menuOpen}
          >
            <span>{menuOpen ? 'Close' : 'Menu'}</span>
            <span className="menu-glyph" aria-hidden="true" data-open={menuOpen}>
              <i />
              <i />
            </span>
          </summary>
          <nav id="mobile-navigation" aria-label="Mobile main menu">
            <ul>
              {navigation.map((item, index) => (
                <li key={item.href}>
                  <span aria-hidden="true">0{index + 1}</span>
                  <Link href={item.href} onClick={closeMenu}>
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <span aria-hidden="true">05</span>
                <Link href="/login" onClick={closeMenu}>
                  Open the app
                </Link>
              </li>
              <li>
                <span aria-hidden="true">06</span>
                <Link href="#contact" onClick={closeMenu}>
                  Contact
                </Link>
              </li>
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
