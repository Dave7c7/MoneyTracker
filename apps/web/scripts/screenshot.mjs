/**
 * Takes screenshots of the app at the widths it has to support.
 *
 * Used to eyeball the dashboards during development:
 *   node scripts/screenshot.mjs http://localhost:3000
 */

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';
const outputDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.screenshots');

const pages = [
  { name: 'overview', url: '/' },
  { name: 'spending', url: '/spending' },
  { name: 'cash-flow', url: '/cash-flow' },
  { name: 'transactions', url: '/transactions' },
  { name: 'accounts', url: '/accounts' },
];

/**
 * The viewports the app supports. A Pixel 10 Pro XL reports 448 CSS pixels
 * wide: 1344 physical pixels at 3x.
 */
const viewports = [
  { name: '360', width: 360, height: 780, scale: 2 },
  { name: 'pixel', width: 448, height: 997, scale: 3 },
  { name: 'desktop', width: 1280, height: 900, scale: 2 },
];

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch();

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.scale,
    isMobile: viewport.width < 1024,
    hasTouch: viewport.width < 1024,
  });
  const page = await context.newPage();

  for (const target of pages) {
    await page.goto(`${baseUrl}${target.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const file = path.join(outputDir, `${target.name}-${viewport.name}.png`);
    await page.screenshot({ path: file, fullPage: viewport.name === 'desktop' });
    console.log(`wrote ${file}`);
  }

  await context.close();
}

await browser.close();
