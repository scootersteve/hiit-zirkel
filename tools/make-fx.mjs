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
    body += strike(rand, a, b, 0.22, 0.9, ['#9fdcff', '#ffffff']);
  }
  writeFileSync(join(OUT, `crown-${n}.svg`), svg('0 0 130 130', body));
}

// ---- bolts from the screen edges, kept away from the middle (ring and texts) ----
const EDGE = [
  [[-10, 60], [110, 300]], [[400, 40], [290, 260]], [[-10, 560], [95, 760]],
  [[400, 520], [300, 720]], [[120, -10], [60, 210]], [[290, 860], [350, 640]],
  [[-10, 300], [70, 470]], [[400, 300], [320, 450]], [[250, -10], [330, 180]],
];
// soft = faint, for page backgrounds behind texts in light and dark
for (const [name, colors, opacity] of [['ice', ['#9fdcff', '#ffffff'], 1], ['soft', ['#8f8bff', '#6f7bff'], 0.22]]) {
  for (let n = 1; n <= 3; n++) {
    const rand = rng(200 + n);
    const body = EDGE.filter((_, i) => i % 3 === n - 1)
      .map(([a, b]) => strike(rand, a, b, 0.16, 2.2, colors))
      .join('');
    writeFileSync(join(OUT, `bolts-${name}-${n}.svg`), svg('0 0 390 844', body, ` preserveAspectRatio="xMidYMid slice"${opacity < 1 ? ` opacity="${opacity}"` : ''}`));
  }
}
console.log(`img/fx: 3 Kränze, 6 Blitz-Ebenen`);
