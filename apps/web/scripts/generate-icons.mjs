/**
 * Generates the PWA icons.
 *
 * Keeping the icons as code means they stay in sync with the brand colour and
 * need no binary assets in the repository.
 *
 * Run with: node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(here, '../public/icons');

/** Brand colours. */
const BACKGROUND = [15, 23, 42, 255]; // slate-900
const BARS = [
  [56, 189, 248, 255], // sky-400
  [14, 165, 233, 255], // sky-500
  [125, 211, 252, 255], // sky-300
];

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Draws the icon: a rounded square with three rising bars. */
function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const barHeights = [0.32, 0.52, 0.74];
  const barWidth = size * 0.16;
  const gap = size * 0.07;
  const baseline = size * 0.74;

  const put = (x, y, [r, g, b, a]) => {
    const offset = (y * size + x) * 4;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = a;
  };

  const inRoundedSquare = (x, y) => {
    const inset = size * 0.04;
    const min = inset;
    const max = size - inset;
    if (x < min || x > max || y < min || y > max) return false;
    const cx = Math.min(Math.max(x, min + radius), max - radius);
    const cy = Math.min(Math.max(y, min + radius), max - radius);
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!inRoundedSquare(x, y)) {
        put(x, y, [0, 0, 0, 0]);
      } else {
        put(x, y, BACKGROUND);
      }
    }
  }

  const totalWidth = barWidth * 3 + gap * 2;
  let barX = (size - totalWidth) / 2;
  barHeights.forEach((heightRatio, index) => {
    const height = size * heightRatio;
    const top = baseline - height;
    for (let y = Math.floor(top); y < Math.floor(baseline); y += 1) {
      for (let x = Math.floor(barX); x < Math.floor(barX + barWidth); x += 1) {
        if (x >= 0 && x < size && y >= 0 && y < size) {
          put(x, y, BARS[index]);
        }
      }
    }
    barX += barWidth + gap;
  });

  // PNG scanlines: one filter byte (0 = none) per row.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(iconsDir, { recursive: true });

for (const size of [180, 192, 512]) {
  const name = size === 180 ? 'apple-icon.png' : `icon-${size}.png`;
  writeFileSync(path.join(iconsDir, name), drawIcon(size));
  console.log(`wrote ${name}`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="MoneyTracker">
  <rect width="512" height="512" rx="112" fill="#0f172a"/>
  <rect x="128" y="259" width="82" height="120" rx="16" fill="#38bdf8"/>
  <rect x="215" y="197" width="82" height="182" rx="16" fill="#0ea5e9"/>
  <rect x="302" y="134" width="82" height="245" rx="16" fill="#7dd3fc"/>
</svg>
`;
writeFileSync(path.join(iconsDir, 'icon.svg'), svg);
console.log('wrote icon.svg');
