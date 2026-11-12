// Draws the lightning graphics of the storm look ("ninja") as static SVG files in img/fx/.
// Seeded random, so every run gives the same files. Run after changing the shapes:
//   node tools/make-fx.mjs
//
// crown-<n>.svg   short bolts that strike outward from the training ring (replaces the rays)
// bolts-<c>-<n>.svg  bolts that run in from the screen edges; c = ice (on dark / phase colours)
//                    or soft (faint violet, page backgrounds in light and dark)
// Three sets each: the CSS lets them flicker at different, uneven rhythms (opacity only).

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const OUT = join(fileURLToPath(new URL('..', import.meta.url)), 'img', 'fx');
mkdirSync(OUT, { recursive: true });

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const r1 = (n) => Math.round(n * 10) / 10;

// jagged line from a to b: midpoint displacement, `rough` = share of the length
function bolt(rand, [x1, y1], [x2, y2], rough, depth = 5) {
  let pts = [[x1, y1], [x2, y2]];
  let amp = Math.hypot(x2 - x1, y2 - y1) * rough;
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const off = (rand() - 0.5) * 2 * amp;
      next.push([(ax + bx) / 2 + (-(by - ay) / len) * off, (ay + by) / 2 + ((bx - ax) / len) * off], [bx, by]);
    }
    pts = next;
    amp /= 2;
  }
  return pts;
}
const d = (pts) => 'M' + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L');

// a bolt with one or two side branches, as glow + core strokes
function strike(rand, a, b, rough, width, colors) {
  const main = bolt(rand, a, b, rough);
  const paths = [main];
  for (let k = 0; k < 2; k++) {
    if (rand() < 0.35) continue;
    const at = main[Math.floor(main.length * (0.25 + rand() * 0.45))];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.6);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * (0.2 + rand() * 0.25);
    paths.push(bolt(rand, at, [at[0] + Math.cos(ang) * len, at[1] + Math.sin(ang) * len], rough, 4));
  }
  const [glow, core] = colors;
  return paths
    .map((p, i) => {
      const w = i === 0 ? width : width * 0.6;
      return `<path d="${d(p)}" stroke="${glow}" stroke-opacity=".38" stroke-width="${r1(w * 3.2)}"/><path d="${d(p)}" stroke="${core}" stroke-width="${r1(w)}"/>`;
    })
    .join('');
}

const svg = (viewBox, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${extra} fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;

// ---- crown around the ring: aura box is 130 × 130, centre 65, ring outer edge at r = 48.5 ----
// ice = storm look ("ninja"), gold = thunder look ("donner")
for (const [suffix, crownColors] of [['', ['#9fdcff', '#ffffff']], ['-gold', ['#ffd60a', '#fff7c2']]])
for (let n = 1; n <= 3; n++) {
  const rand = rng(100 + n);
  let body = '';
  const count = 7;
  for (let i = 0; i < count; i++) {
    const ang = ((i + rand() * 0.6 + n * 0.33) / count) * Math.PI * 2;
    const r0 = 49.5;
    const r2 = 57 + rand() * 7;
    const a = [65 + Math.cos(ang) * r0, 65 + Math.sin(ang) * r0];
    const b = [65 + Math.cos(ang + (rand() - 0.5) * 0.25) * r2, 65 + Math.sin(ang + (rand() - 0.5) * 0.25) * r2];
    body += strike(rand, a, b, 0.22, 0.9, crownColors);
  }
  writeFileSync(join(OUT, `crown${suffix}-${n}.svg`), svg('0 0 130 130', body));
}

// ---- bolts from the screen edges, kept away from the middle (ring and texts) ----
const EDGE = [
  [[-10, 60], [110, 300]], [[400, 40], [290, 260]], [[-10, 560], [95, 760]],
  [[400, 520], [300, 720]], [[120, -10], [60, 210]], [[290, 860], [350, 640]],
  [[-10, 300], [70, 470]], [[400, 300], [320, 450]], [[250, -10], [330, 180]],
];
// soft = faint, for page backgrounds behind texts in light and dark
for (const [name, colors, opacity] of [['ice', ['#9fdcff', '#ffffff'], 1], ['gold', ['#ffd60a', '#fff7c2'], 1], ['soft', ['#8f8bff', '#6f7bff'], 0.22]]) {
  for (let n = 1; n <= 3; n++) {
    const rand = rng(200 + n);
    const body = EDGE.filter((_, i) => i % 3 === n - 1)
      .map(([a, b]) => strike(rand, a, b, 0.16, 2.2, colors))
      .join('');
    writeFileSync(join(OUT, `bolts-${name}-${n}.svg`), svg('0 0 390 844', body, ` preserveAspectRatio="xMidYMid slice"${opacity < 1 ? ` opacity="${opacity}"` : ''}`));
  }
}

// ================= fire look ("flammen") =================
// flames-crown-<n>.svg  tongues of flame around the ring
// fire-<c>-<n>.svg      flames rising from the bottom edge plus embers; c = hot (training) or
//                       soft (faint embers, page backgrounds)

// one tongue: base centre (bx, by), direction ang, length len, half width w, curl to one side
function tongue(bx, by, ang, len, w, curl) {
  const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
  const p = (along, side) => `${r1(bx + dx * along + nx * side)} ${r1(by + dy * along + ny * side)}`;
  return `M${p(0, -w)}C${p(len * 0.35, -w * 1.25)} ${p(len * 0.6, -w * 0.2 + curl)} ${p(len, curl * 1.6)}C${p(len * 0.62, w * 0.5 + curl)} ${p(len * 0.3, w * 1.2)} ${p(0, w)}Z`;
}

for (let n = 1; n <= 3; n++) {
  const rand = rng(300 + n);
  let outer = '';
  let inner = '';
  const count = 16;
  for (let i = 0; i < count; i++) {
    const ang = ((i + rand() * 0.7 + n * 0.31) / count) * Math.PI * 2;
    const len = 7 + rand() * 9;
    const w = 2.6 + rand() * 1.6;
    const curl = (rand() - 0.5) * 3.2;
    const bx = 65 + Math.cos(ang) * 48.2, by = 65 + Math.sin(ang) * 48.2;
    outer += tongue(bx, by, ang, len, w, curl);
    inner += tongue(bx, by, ang, len * 0.55, w * 0.5, curl * 0.5);
  }
  writeFileSync(join(OUT, `flames-crown-${n}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130"><defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="65" cy="65" r="65"><stop offset=".72" stop-color="#ffd24a"/><stop offset=".86" stop-color="#ff7a1a"/><stop offset="1" stop-color="#c7300f" stop-opacity=".1"/></radialGradient></defs><path d="${outer}" fill="url(#g)"/><path d="${inner}" fill="#fff3c4" fill-opacity=".85"/></svg>\n`);
}

for (const [name, opacity] of [['hot', 1], ['soft', 0.2]]) {
  for (let n = 1; n <= 3; n++) {
    const rand = rng(400 + n);
    let flames = '';
    let cores = '';
    let embers = '';
    for (let x = -20 + n * 9; x < 410; x += 26 + rand() * 20) {
      const len = 70 + rand() * 150;
      const w = 16 + rand() * 14;
      const curl = (rand() - 0.5) * 26;
      flames += tongue(x, 850, -Math.PI / 2, len, w, curl);
      cores += tongue(x, 850, -Math.PI / 2, len * 0.5, w * 0.45, curl * 0.4);
    }
    for (let i = 0; i < 26; i++) {
      const side = rand() < 0.5 ? rand() * 90 : 300 + rand() * 90;
      const y = 40 + rand() * 720;
      embers += `<circle cx="${r1(side)}" cy="${r1(y)}" r="${r1(1 + rand() * 2.4)}"/>`;
    }
    const body = name === 'hot'
      ? `<defs><linearGradient id="f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd24a"/><stop offset=".45" stop-color="#ff7a1a" stop-opacity=".85"/><stop offset="1" stop-color="#c7300f" stop-opacity="0"/></linearGradient></defs><path d="${flames}" fill="url(#f)"/><path d="${cores}" fill="#fff3c4" fill-opacity=".7"/><g fill="#ffd24a">${embers}</g>`
      : `<g fill="#ff7a1a">${embers}</g>`;
    writeFileSync(join(OUT, `fire-${name}-${n}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844" preserveAspectRatio="xMidYMax slice"${opacity < 1 ? ` opacity="${opacity}"` : ''}>${body}</svg>\n`);
  }
}

// ================= wild look ("wildnis") =================
// leaves-crown-<n>.svg  a wreath of leaves around the ring
// wild-<c>-<n>.svg      blades of grass from the bottom edge plus drifting leaves; c = hot or soft
for (let n = 1; n <= 3; n++) {
  const rand = rng(500 + n);
  let dark = '';
  let light = '';
  let gold = '';
  const count = 18;
  for (let i = 0; i < count; i++) {
    const ang = ((i + rand() * 0.6 + n * 0.29) / count) * Math.PI * 2;
    const len = 8 + rand() * 7;
    const w = 2.8 + rand() * 1.4;
    const curl = (rand() - 0.5) * 2.4;
    const bx = 65 + Math.cos(ang) * 48.4, by = 65 + Math.sin(ang) * 48.4;
    const lean = ang + (rand() - 0.5) * 0.9;
    const leaf = tongue(bx, by, lean, len, w, curl);
    if (i % 5 === 0) gold += leaf;
    else if (i % 2) light += leaf;
    else dark += leaf;
  }
  writeFileSync(join(OUT, `leaves-crown-${n}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 130" stroke="#0e2a1a" stroke-width=".5" stroke-linejoin="round"><path d="${dark}" fill="#2f9e63"/><path d="${light}" fill="#3fd1b0"/><path d="${gold}" fill="#f2c94c"/></svg>\n`);
}
for (const [name, opacity] of [['hot', 1], ['soft', 0.2]]) {
  for (let n = 1; n <= 3; n++) {
    const rand = rng(600 + n);
    let grass = '';
    let leavesA = '';
    let leavesB = '';
    for (let x = -20 + n * 7; x < 410; x += 16 + rand() * 16) {
      grass += tongue(x, 850, -Math.PI / 2 + (rand() - 0.5) * 0.5, 50 + rand() * 120, 7 + rand() * 6, (rand() - 0.5) * 22);
    }
    for (let i = 0; i < 20; i++) {
      const x = rand() < 0.5 ? rand() * 95 : 295 + rand() * 95;
      const y = 40 + rand() * 700;
      const leaf = tongue(x, y, rand() * Math.PI * 2, 12 + rand() * 12, 3.5 + rand() * 2.5, (rand() - 0.5) * 4);
      if (i % 3 === 0) leavesB += leaf;
      else leavesA += leaf;
    }
    const body = name === 'hot'
      ? `<defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3fd1b0"/><stop offset=".5" stop-color="#2f9e63" stop-opacity=".8"/><stop offset="1" stop-color="#1f7a4a" stop-opacity="0"/></linearGradient></defs><path d="${grass}" fill="url(#g)"/><path d="${leavesA}" fill="#8fe3b0"/><path d="${leavesB}" fill="#f2c94c"/>`
      : `<path d="${leavesA}" fill="#2f9e63"/><path d="${leavesB}" fill="#c9a227"/>`;
    writeFileSync(join(OUT, `wild-${name}-${n}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844" preserveAspectRatio="xMidYMax slice"${opacity < 1 ? ` opacity="${opacity}"` : ''}>${body}</svg>\n`);
  }
}
console.log('img/fx: Blitze, Flammen und Blätter (je Kränze und Ebenen)');
