#!/usr/bin/env node
// Generate placeholder PWA icons from scratch using zlib + a hand-written PNG
// encoder. No external deps. Produces a solid navy background with a centred
// red Mars disk, at 192x192, 512x512, and 512x512 maskable variants.
//
// Output goes to packages/web/static/icons/. Re-run after `git pull` if the
// files are missing.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, 'packages/web/static/icons');

// Colours: navy background, Mars-red disk.
const BG = [0x1f, 0x29, 0x33, 0xff]; // theme-color from manifest
const FG = [0xd6, 0x37, 0x1e, 0xff]; // Mars red from favicon.svg

function makeImage(size, opts = {}) {
  const { discRadius, discOffsetX = 0, discOffsetY = 0, safeZonePad = 0 } = opts;
  const cx = size / 2 + discOffsetX;
  const cy = size / 2 + discOffsetY;
  // For maskable icons, shrink the disk so it sits inside the 80% safe zone.
  const r = discRadius ?? size / 2 - safeZonePad;

  // Each row: 1 filter byte + 4 bytes/pixel * size
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inDisc = dx * dx + dy * dy <= r * r;
      const c = inDisc ? FG : BG;
      const off = y * rowBytes + 1 + x * 4;
      raw[off + 0] = c[0];
      raw[off + 1] = c[1];
      raw[off + 2] = c[2];
      raw[off + 3] = c[3];
    }
  }

  return encodePng(size, size, raw);
}

function encodePng(width, height, raw) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const icons = [
  { name: 'icon-192.png', size: 192, opts: { discRadius: 60 } },
  { name: 'icon-512.png', size: 512, opts: { discRadius: 160 } },
  // Maskable: the disc must sit inside the safe zone (centre 80% of canvas).
  { name: 'icon-maskable-512.png', size: 512, opts: { discRadius: 130 } },
];

for (const icon of icons) {
  const buf = makeImage(icon.size, icon.opts);
  const path = resolve(outDir, icon.name);
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${buf.length} bytes)`);
}
