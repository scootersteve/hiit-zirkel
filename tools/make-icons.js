// Generates the app icons as PNGs, no dependencies (own minimal PNG encoder).
// Usage: node tools/make-icons.js
// Placeholder look: dark background, orange ring + centre dot (brand colours). Step 9 can replace it.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const BG = [13, 15, 19]; // --bg  #0d0f13
const ORANGE = [255, 122, 26]; // --accent #ff7a1a

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
};

// Colour at a point in normalised coords (0..1). d = distance from centre / radius (1 = edge midpoint).
// Content stays within d < 0.8 (the maskable safe zone).
function colourAt(nx, ny) {
  const d = Math.hypot(nx - 0.5, ny - 0.5) * 2;
  const inRing = d > 0.52 && d < 0.72;
  const inDot = d < 0.2;
  return inRing || inDot ? ORANGE : BG;
}

function makePng(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // 2×2 supersampling smooths the ring edges
      let r = 0, g = 0, b = 0;
      for (const dy of [0.25, 0.75]) for (const dx of [0.25, 0.75]) {
        const [cr, cg, cb] = colourAt((x + dx) / size, (y + dy) / size);
        r += cr; g += cg; b += cb;
      }
      raw[o++] = Math.round(r / 4);
      raw[o++] = Math.round(g / 4);
      raw[o++] = Math.round(b / 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour (RGB)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const out = (name) => fileURLToPath(new URL('../' + name, import.meta.url));

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(out(name), makePng(size));
  console.log(`${name} (${size}×${size}) written`);
}
