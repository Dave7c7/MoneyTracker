'use client';

import { useEffect } from 'react';

/**
 * Marks the app as running.
 *
 * The page is sent by the server and the interactive parts are added by the
 * browser. If the scripts never arrive, the page still shows its numbers but
 * nothing works, which looks like a broken app without saying why.
 *
 * This sets one attribute on the document. The layout puts a message on the
 * screen while the attribute is missing.
 */
export function AppBootCheck() {
  useEffect(() => {
    document.documentElement.dataset.app = 'ready';
  }, []);

  return null;
}
