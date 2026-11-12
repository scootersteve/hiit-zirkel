// The looks' figures: every look except "standard" has both poses as a plain, self-contained
// SVG (original drawings; the files are loaded as <img>, so they must not need anything else).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LOOKS, LOOK_IDS, lookById, characterSrc, CHARACTER_POSES, PORTRAIT_LOOKS, PORTRAIT_SIZES, hasPortrait } from '../js/data/looks.js';

const file = (path) => new URL(`../${path}`, import.meta.url);

test('Designs: Flammen zuerst, das ruhige Standard-Design zuletzt, eindeutige Kennungen', () => {
  assert.equal(LOOK_IDS[0], 'flammen');
  assert.equal(LOOK_IDS.at(-1), 'standard');
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
      for (const size of ['large', 'small']) {
        const src = characterSrc(look.id, pose, size);
        assert.match(src, hasPortrait(look.id) ? /^img\/portraits\/[a-z]+-(ready|cheer)-(640|216)\.webp$/ : /^img\/characters\/[a-z]+-(ready|cheer)\.svg$/, src);
        assert.ok(existsSync(file(src)), `Datei fehlt: ${src}`);
      }
    }
  }
});

test('Porträts: WebP, quadratisch in der angegebenen Größe, im Größenrahmen', () => {
  assert.ok(PORTRAIT_LOOKS.length >= 1);
  for (const look of PORTRAIT_LOOKS) {
    assert.ok(LOOK_IDS.includes(look) && look !== 'standard', look);
    for (const [pose, sizes] of Object.entries(PORTRAIT_SIZES)) {
      for (const px of sizes) {
        const path = `img/portraits/${look}-${pose}-${px}.webp`;
        const b = readFileSync(file(path));
        assert.equal(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 12), 'RIFFWEBP', `${path}: kein WebP`);
        assert.equal(b.toString('ascii', 12, 16), 'VP8X', `${path}: unerwartete WebP-Art`);
        const w = 1 + b.readUIntLE(24, 3);
        const h = 1 + b.readUIntLE(27, 3);
        assert.deepEqual([w, h], [px, px], `${path}: ${w}x${h}`);
        assert.ok(b.length <= (px === 640 ? 110 : 24) * 1024, `${path}: ${(b.length / 1024).toFixed(0)} kB`);
      }
    }
  }
});

test('Figuren-Dateien: reines, eigenständiges SVG, klein, mit Titel', () => {
  for (const look of LOOKS.filter((l) => l.id !== 'standard' && !hasPortrait(l.id))) {
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
