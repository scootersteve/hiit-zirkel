// Guards the colour tokens: every text/background pair the UI uses must stay readable in the
// light AND the dark scheme (WCAG contrast, 4.5:1 for text). Reads css/tokens.css and the looks
// in css/looks.css directly, so a theme change that breaks legibility fails here before anyone
// sees it on a phone. A look only overrides tokens; what it leaves alone comes from tokens.css.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../css/${file}`, import.meta.url), 'utf8');

// --name: value;  →  { name: { light, dark } }   (plain values count for both schemes)
function readTokens(css) {
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
  return tokens;
}

const base = readTokens(read('tokens.css'));
// "Standard" plus one entry per :root[data-look="…"] block
const LOOKS = { Standard: base };
for (const [, name, body] of read('looks.css').matchAll(/:root\[data-look="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
  LOOKS[name] = { ...base, ...(LOOKS[name] || {}), ...readTokens(body) };
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
function resolve(tokens, scheme, layers) {
  return layers.map((n) => parse(tokens[n][scheme])).reduce((acc, layer) => over(layer, acc));
}

const PHASES = ['prep', 'warmup', 'work', 'rest', 'roundRest', 'cooldown'];
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
  ...PHASES.flatMap((p) => ['', '-top', '-bottom'].map((stop) => ['--on-phase', [`--phase-${p}${stop}`], 4.5])),
];

for (const [look, tokens] of Object.entries(LOOKS)) {
  for (const scheme of ['light', 'dark']) {
    const where = `${look}, ${scheme === 'light' ? 'heller' : 'dunkler'} Modus`;

    test(`Kontrast der Farb-Tokens: ${where}`, () => {
      const failures = [];
      for (const [fg, layers, min] of PAIRS) {
        const bg = resolve(tokens, scheme, layers);
        const ratio = contrast(over(parse(tokens[fg][scheme]), bg), bg);
        if (ratio < min) failures.push(`${fg} auf ${layers.join(' + ')}: ${ratio.toFixed(2)} (Minimum ${min})`);
      }
      assert.deepEqual(failures, []);
    });

    // Body graphic: the load steps are graphics, not text. The strongest step must stand out
    // clearly from the resting body and from the card (3:1, WCAG 1.4.11); the steps in between
    // must get stronger step by step, so the order also reads without colour vision.
    test(`Muskelgrafik, Stufen sind unterscheidbar: ${where}`, () => {
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

  // The phases must stay apart from each other too: from 2 m the colour tells work from rest.
  test(`Phasenfarben sind voneinander unterscheidbar: ${look}`, () => {
    const hue = ([r, g, b]) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return 0;
      const d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const apart = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    const h = Object.fromEntries(PHASES.map((p) => [p, hue(parse(tokens[`--phase-${p}`].light))]));
    assert.ok(apart(h.work, h.rest) >= 90, `Belastung und Pause zu ähnlich: ${h.work.toFixed(0)}° / ${h.rest.toFixed(0)}°`);
    assert.ok(apart(h.work, h.roundRest) >= 60, `Belastung und Rundenpause zu ähnlich: ${h.work.toFixed(0)}° / ${h.roundRest.toFixed(0)}°`);
    assert.ok(apart(h.rest, h.roundRest) >= 60, `Pause und Rundenpause zu ähnlich: ${h.rest.toFixed(0)}° / ${h.roundRest.toFixed(0)}°`);
  });
}

test('Jedes Farb-Token mit zwei Werten ist in beiden Schemata lesbar definiert', () => {
  for (const [look, tokens] of Object.entries(LOOKS)) {
    for (const [name, t] of Object.entries(tokens)) {
      if (!/^(#|rgb\()/.test(t.light)) continue; // sizes, fonts, curves
      assert.doesNotThrow(() => parse(t.light), `${look} ${name}`);
      assert.doesNotThrow(() => parse(t.dark), `${look} ${name}`);
    }
  }
});

test('Looks: es gibt mindestens einen, und jeder setzt Flächen, Text, Akzent und alle Phasen', () => {
  const names = Object.keys(LOOKS).filter((n) => n !== 'Standard');
  assert.ok(names.length >= 1);
  const css = read('looks.css');
  for (const name of names) {
    const body = [...css.matchAll(new RegExp(`:root\\[data-look="${name}"\\]\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
    const own = readTokens(body);
    for (const token of ['--bg', '--surface', '--text', '--text-2', '--accent', '--accent-fill', '--on-accent', '--aura', ...PHASES.map((p) => `--phase-${p}`)]) {
      assert.ok(token in own, `${name}: ${token} fehlt`);
    }
  }
});
