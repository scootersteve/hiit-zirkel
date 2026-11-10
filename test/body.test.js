// Guards the body graphic data (js/data/body.js, generated from react-native-body-highlighter):
// every muscle region the exercises use must be drawable, and the licence text shown in the
// app must be the one in THIRD-PARTY-NOTICES.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BODY } from '../js/data/body.js';
import { MUSCLES } from '../js/data/muscles.js';
import { EXERCISES } from '../js/data/exercises.js';
import { BODY_GRAPHIC } from '../js/data/licenses.js';

const regions = (side) => BODY[side].parts.map(([slug]) => slug);
const EXTRA = ['head', 'hair', 'hands', 'knees', 'ankles', 'feet']; // complete the figure, no muscles

test('Jede der 17 Muskelregionen ist vorne oder hinten gezeichnet', () => {
  const drawn = new Set([...regions('front'), ...regions('back')]);
  for (const m of Object.keys(MUSCLES)) assert.ok(drawn.has(m), `Region fehlt in der Grafik: ${m}`);
});

test('Die Grafik enthält nur bekannte Regionen, jede Seite jede höchstens einmal', () => {
  for (const side of ['front', 'back']) {
    const list = regions(side);
    assert.equal(new Set(list).size, list.length, `${side}: doppelte Region`);
    for (const slug of list) assert.ok(slug in MUSCLES || EXTRA.includes(slug), `${side}: unbekannte Region ${slug}`);
  }
});

test('Jede Muskelangabe der eingebauten Übungen ist zeichenbar', () => {
  const drawn = new Set([...regions('front'), ...regions('back')]);
  for (const e of EXERCISES) {
    for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) assert.ok(drawn.has(m), `${e.id}: ${m}`);
  }
});

test('Pfaddaten und Bildausschnitt sind gültig', () => {
  for (const side of ['front', 'back']) {
    const { viewBox, outline, parts } = BODY[side];
    const box = viewBox.split(' ').map(Number);
    assert.equal(box.length, 4);
    assert.ok(box.every(Number.isFinite) && box[2] > 0 && box[3] > 0, `${side}: viewBox ${viewBox}`);
    for (const d of [outline, ...parts.map(([, path]) => path)]) {
      assert.match(d, /^[Mm]/, `${side}: Pfad beginnt nicht mit M`);
      assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9eE\s.,+-]+$/, `${side}: unerwartete Zeichen im Pfad`); // nothing that could break out of the attribute
    }
  }
  // both sides are drawn at the same size, so they stand level next to each other
  assert.deepEqual(BODY.front.viewBox.split(' ').slice(2), BODY.back.viewBox.split(' ').slice(2));
});

test('Lizenztext in der App und in THIRD-PARTY-NOTICES.md stimmen überein', () => {
  const notices = readFileSync(new URL('../THIRD-PARTY-NOTICES.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(notices.includes(BODY_GRAPHIC.license), 'Lizenztext weicht ab');
  assert.ok(notices.includes(BODY_GRAPHIC.url));
  assert.match(BODY_GRAPHIC.license, /Copyright \(c\) 2022 ELABBASSI Hicham/);
  const header = readFileSync(new URL('../js/data/body.js', import.meta.url), 'utf8').slice(0, 600);
  assert.match(header, /MIT License, Copyright \(c\) 2022 ELABBASSI Hicham/);
});
