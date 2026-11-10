// Guards the colour tokens: every text/background pair the UI uses must stay readable in the
// light AND the dark scheme (WCAG contrast, 4.5:1 for text). Reads css/tokens.css directly, so
// a theme change that breaks legibility fails here before anyone sees it on a phone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');

// --name: value;  →  { name: { light, dark } }   (plain values count for both schemes)
const tokens = {};
for (const [, name, raw] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
  const m = raw.match(/^light-dark\((.+)\)$/s);
  if (m) {
    // split on the comma between the two colours, not the ones inside rgb()
    let depth = 0;
    let cut = -1;
    [...m[1]].forEach((ch, i) => {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0 && cut < 0) cut = i;
    });
    tokens[name] = { light: m[1].slice(0, cut).trim(), dark: m[1].slice(cut + 1).trim() };
  } else {
    tokens[name] = { light: raw.trim(), dark: raw.trim() };
  }
}

function parse(color) {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const rgb = color.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`Farbe nicht lesbar: ${color}`);
}
const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
const luminance = ([r, g, b]) => {
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

// layers are composited bottom-up: ['--bg'] or ['--surface', '--fill'] (fill on top of surface)
function resolve(scheme, layers) {
  return layers.map((n) => parse(tokens[n][scheme])).reduce((acc, layer) => over(layer, acc));
}

const PAIRS = [
  // [text token, background layers, minimum]
  ['--text', ['--bg'], 4.5],
  ['--text', ['--surface'], 4.5],
  ['--text', ['--surface-2'], 4.5],
  ['--text', ['--surface', '--fill'], 4.5],
  ['--text', ['--bg', '--fill'], 4.5],
  ['--text', ['--thumb'], 4.5],
  ['--text-2', ['--bg'], 4.5],
  ['--text-2', ['--surface'], 4.5],
  ['--text-2', ['--surface-2'], 4.5],
  ['--text-3', ['--surface'], 3],
  ['--accent', ['--bg'], 4.5],
  ['--accent', ['--surface'], 4.5],
  ['--accent', ['--surface', '--accent-tint'], 4.5],
  ['--accent', ['--bg', '--accent-tint'], 4.5],
  ['--on-accent', ['--accent-fill'], 4.5],
  ['--on-accent', ['--accent-fill-top'], 4.5],
  ['--on-accent', ['--accent-fill-bottom'], 4.5],
  ['--success', ['--surface'], 4.5],
  ['--success', ['--bg'], 4.5],
  ['--danger', ['--surface'], 4.5],
  ['--danger', ['--bg'], 4.5],
  ['--danger', ['--surface', '--danger-tint'], 4.5],
  ['--on-danger', ['--danger-fill'], 4.5],
  ...['prep', 'warmup', 'work', 'rest', 'roundRest', 'cooldown'].flatMap((p) =>
    ['', '-top', '-bottom'].map((stop) => ['--on-phase', [`--phase-${p}${stop}`], 4.5])),
];

for (const scheme of ['light', 'dark']) {
  test(`Kontrast der Farb-Tokens, ${scheme === 'light' ? 'heller' : 'dunkler'} Modus`, () => {
    const failures = [];
    for (const [fg, layers, min] of PAIRS) {
      const bg = resolve(scheme, layers);
      const ratio = contrast(over(parse(tokens[fg][scheme]), bg), bg);
      if (ratio < min) failures.push(`${fg} auf ${layers.join(' + ')}: ${ratio.toFixed(2)} (Minimum ${min})`);
    }
    assert.deepEqual(failures, []);
  });
}

// Body graphic: the load steps are graphics, not text. The strongest step must stand out
// clearly from the resting body and from the card (3:1, WCAG 1.4.11); the steps in between
// must get stronger step by step, so the order also reads without colour vision.
for (const scheme of ['light', 'dark']) {
  test(`Muskelgrafik: Stufen sind unterscheidbar, ${scheme === 'light' ? 'heller' : 'dunkler'} Modus`, () => {
    const colour = (name) => parse(tokens[name][scheme]);
    const surface = colour('--surface');
    const steps = ['--muscle-0', '--muscle-1', '--muscle-2', '--muscle-3'].map(colour);
    assert.ok(contrast(steps[3], steps[0]) >= 3, `Stufe 3 gegen Körper: ${contrast(steps[3], steps[0]).toFixed(2)}`);
    assert.ok(contrast(steps[3], surface) >= 3, `Stufe 3 gegen Karte: ${contrast(steps[3], surface).toFixed(2)}`);
    // each step moves further away from the card than the one before, by a visible amount
    const distance = steps.map((c) => contrast(c, surface));
    for (let i = 1; i < distance.length; i++) {
      assert.ok(distance[i] >= distance[i - 1] * 1.2, `Stufe ${i} hebt sich zu wenig von Stufe ${i - 1} ab: ${distance.map((d) => d.toFixed(2)).join(' / ')}`);
    }
    assert.ok(contrast(colour('--muscle-line'), surface) >= 1.5, 'Umriss gegen Karte');
  });
}

test('Jedes Farb-Token mit zwei Werten ist in beiden Schemata lesbar definiert', () => {
  for (const [name, t] of Object.entries(tokens)) {
    if (!/^(#|rgb\()/.test(t.light)) continue; // sizes, fonts, curves
    assert.doesNotThrow(() => parse(t.light), name);
    assert.doesNotThrow(() => parse(t.dark), name);
  }
});
