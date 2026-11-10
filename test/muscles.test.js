// Levels for the body graphic: one exercise, and the load of a whole circuit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseLevels, circuitLoad } from '../js/core/muscles.js';
import { EXERCISES } from '../js/data/exercises.js';
import { SAMPLE_CIRCUITS } from '../js/data/samples.js';

const byId = new Map(EXERCISES.map((e) => [e.id, e]));
const lookup = (id) => byId.get(id);

test('Übung: Hauptmuskeln Stufe 3, Nebenmuskeln Stufe 1', () => {
  assert.deepEqual(exerciseLevels({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'deltoids'] }), {
    chest: 3,
    triceps: 1,
    deltoids: 1,
  });
});

test('Übung: steht ein Muskel in beiden Listen, gilt er als Hauptmuskel', () => {
  assert.deepEqual(exerciseLevels({ primaryMuscles: ['abs'], secondaryMuscles: ['abs', 'obliques'] }), { abs: 3, obliques: 1 });
});

test('Übung: unbekannte Regionen und fehlende Listen werden ignoriert', () => {
  assert.deepEqual(exerciseLevels({ primaryMuscles: ['hip-flexors', 'chest'] }), { chest: 3 });
  assert.deepEqual(exerciseLevels({}), {});
  assert.deepEqual(exerciseLevels(undefined), {});
});

test('Zirkel: eine Übung ergibt dieselben Regionen wie die Übung, Hauptmuskel als Schwerpunkt', () => {
  const { levels, ranked, known, unknown } = circuitLoad([{ id: 'pushups' }], { workS: 40 }, lookup);
  assert.deepEqual(levels, { chest: 3, deltoids: 2, triceps: 2 }); // 40 % of the main muscle
  assert.equal(ranked[0], 'chest');
  assert.deepEqual([known, unknown], [1, 0]);
});

test('Zirkel: die meistbelastete Region ist Stufe 3, die anderen stufen sich nach Anteil ab', () => {
  // quadriceps: 3 × 40 as main muscle; chest: 40 main; calves: 0.4 × 40
  const snaps = [{ id: 'squats' }, { id: 'lunges' }, { id: 'jump-lunges' }, { id: 'pushups' }];
  const { levels, ranked } = circuitLoad(snaps, { workS: 40 }, lookup);
  assert.equal(ranked[0], 'quadriceps');
  assert.equal(levels.quadriceps, 3);
  assert.equal(levels.chest, 2); // 40 of 120 = one third
  assert.equal(levels.triceps, 1); // 16 of 120
});

test('Zirkel: eigene Belastungszeit einer Übung zählt statt der allgemeinen', () => {
  const same = circuitLoad([{ id: 'pushups' }, { id: 'squats' }], { workS: 30 }, lookup);
  assert.equal(same.levels.chest, 3);
  assert.equal(same.levels.quadriceps, 3);
  const long = circuitLoad([{ id: 'pushups', workS: 10 }, { id: 'squats', workS: 60 }], { workS: 30 }, lookup);
  assert.equal(long.ranked[0], 'quadriceps');
  assert.equal(long.levels.chest, 1); // 10 of 60
});

test('Zirkel: Übungen, die es in der Liste nicht gibt, werden gezählt statt geraten', () => {
  const { levels, ranked, known, unknown } = circuitLoad([{ id: 'c-weg' }, { id: 'x0' }], { workS: 40 }, lookup);
  assert.deepEqual(levels, {});
  assert.deepEqual(ranked, []);
  assert.deepEqual([known, unknown], [0, 2]);
});

test('Zirkel: leer oder ohne Zeit ergibt keine Regionen', () => {
  assert.deepEqual(circuitLoad([], { workS: 40 }, lookup).ranked, []);
  assert.deepEqual(circuitLoad(undefined, undefined, lookup).ranked, []);
  assert.deepEqual(circuitLoad([{ id: 'pushups' }], { workS: 0 }, lookup).ranked, []);
});

test('Zirkel: Reihenfolge der Übungen ändert das Ergebnis nicht', () => {
  const circuit = SAMPLE_CIRCUITS[0];
  const a = circuitLoad(circuit.exercises, circuit.settings, lookup);
  const b = circuitLoad([...circuit.exercises].reverse(), circuit.settings, lookup);
  assert.deepEqual(a, b);
  assert.equal(a.unknown, 0);
  assert.equal(a.levels[a.ranked[0]], 3);
});
