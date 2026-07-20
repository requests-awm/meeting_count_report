import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = resolve(root, 'assets/ascot-logo.png');
const OUT = resolve(root, 'assets/favicon.png');
const SIZE = 256;
const NAVY = { r: 20, g: 40, b: 75 };

// 1) Read raw pixels and locate the gold crown by colour.
const { data, info } = await sharp(LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;

const isGold = (r, g, b) => r > 170 && g > 105 && g < 205 && b < 115 && r >= g;

let minX = width, minY = height, maxX = 0, maxY = 0, count = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    if (isGold(data[i], data[i + 1], data[i + 2])) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      count++;
    }
  }
}
if (count < 50) throw new Error('Could not locate the gold crown in the logo.');
console.log(`crown bbox: x[${minX}-${maxX}] y[${minY}-${maxY}] (${count} gold px)`);

// 2) Build a crown-only RGBA buffer (gold kept, everything else transparent).
const cw = maxX - minX + 1;
const ch = maxY - minY + 1;
const crown = Buffer.alloc(cw * ch * 4, 0);
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const si = ((y + minY) * width + (x + minX)) * channels;
    const di = (y * cw + x) * 4;
    if (isGold(data[si], data[si + 1], data[si + 2])) {
      crown[di] = data[si];
      crown[di + 1] = data[si + 1];
      crown[di + 2] = data[si + 2];
      crown[di + 3] = 255;
    }
  }
}

// 3) Navy rounded square background.
const bg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="48" fill="rgb(${NAVY.r},${NAVY.g},${NAVY.b})"/></svg>`
);

// 4) Resize crown to ~66% of the tile and centre it.
const target = Math.round(SIZE * 0.66);
const crownPng = await sharp(crown, { raw: { width: cw, height: ch, channels: 4 } })
  .resize({ width: target, fit: 'inside' })
  .png()
  .toBuffer();

await sharp(bg)
  .composite([{ input: crownPng, gravity: 'center' }])
  .png()
  .toFile(OUT);

console.log(`wrote ${OUT}`);
