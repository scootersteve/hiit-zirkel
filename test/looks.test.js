// The looks' figures: every look except "standard" has both poses as a plain, self-contained
// SVG (original drawings; the files are loaded as <img>, so they must not need anything else).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LOOKS, LOOK_IDS, lookById, characterSrc, CHARACTER_POSES } from '../js/data/looks.js';

const file = (path) => new URL(`../${path}`, import.meta.url);

test('Designs: "standard" zuerst, eindeutige Kennungen, unbekannte Kennung fällt auf Standard', () => {
  assert.equal(LOOK_IDS[0], 'standard');
  assert.equal(new Set(LOOK_IDS).size, LOOK_IDS.length);
  assert.equal(lookById('gibt-es-nicht').id, 'standard');
  assert.equal(lookById(undefined).id, 'standard');
  for (const id of LOOK_IDS) assert.match(id, /^[a-z]+$/, 'index.html setzt nur Kennungen aus Kleinbuchstaben vor dem ersten Bild');
});

test('Figuren: Standard hat keine, jedes andere Design beide Posen', () => {
  assert.equal(characterSrc('standard'), null);
  assert.equal(characterSrc('gibt-es-nicht'), null);
  assert.equal(characterSrc('flammen', 'tanzt'), null);
  for (const look of LOOKS.filter((l) => l.id !== 'standard')) {
    for (const pose of CHARACTER_POSES) {
      const src = characterSrc(look.id, pose);
      assert.equal(src, `img/characters/${look.id}-${pose}.svg`);
      assert.ok(existsSync(file(src)), `Datei fehlt: ${src}`);
    }
  }
});

test('Figuren-Dateien: reines, eigenständiges SVG, klein, mit Titel', () => {
  for (const look of LOOKS.filter((l) => l.id !== 'standard')) {
    for (const pose of CHARACTER_POSES) {
      const src = characterSrc(look.id, pose);
      const svg = readFileSync(file(src), 'utf8');
      assert.ok(svg.length <= 14 * 1024, `${src}: ${svg.length} Bytes`);
      assert.match(svg, /^\s*(<\?xml[^>]*>\s*)?<svg[^>]*viewBox="0 0 240 320"/, `${src}: viewBox`);
      assert.match(svg, /<title>[^<]+<\/title>/, `${src}: Titel fehlt`);
      // nothing that runs, loads or depends on something outside the file
      for (const banned of [/<script/i, /<foreignObject/i, /<image/i, /<text/i, /<style/i, /<filter/i, /\son\w+=/i, /href\s*=\s*["'](?!#)/i, /url\(\s*["']?(?!#)/i, /@import/i]) {
        assert.doesNotMatch(svg, banned, `${src}: ${banned}`);
      }
    }
  }
});
