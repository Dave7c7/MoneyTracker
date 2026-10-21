/**
 * Takes screenshots of the app at phone and desktop widths.
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

const viewports = [
  { name: 'phone', width: 360, height: 780 },
  { name: 'desktop', width: 1280, height: 900 },
];

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch();

for (const viewport of viewports) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
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
