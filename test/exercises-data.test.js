import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, CATEGORIES, EQUIPMENT } from '../js/data/exercises.js';
import { MUSCLES } from '../js/data/muscles.js';

const normalize = (name) => name.toLowerCase().replace(/\s+/g, '');

test('60 bis 80 Übungen', () => {
  assert.ok(EXERCISES.length >= 60 && EXERCISES.length <= 80, `${EXERCISES.length}`);
});

test('IDs und Namen eindeutig (Groß-/Kleinschreibung und Leerzeichen ignoriert)', () => {
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
  assert.equal(new Set(EXERCISES.map((e) => normalize(e.name))).size, EXERCISES.length);
});

test('Nur gültige Kategorien, Ausrüstung und Muskelgruppen', () => {
  for (const e of EXERCISES) {
    assert.ok(e.category in CATEGORIES, `${e.id}: ${e.category}`);
    assert.ok(e.equipment in EQUIPMENT, `${e.id}: ${e.equipment}`);
    assert.ok(e.primaryMuscles.length > 0, `${e.id}: no primary muscle`);
    for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) assert.ok(m in MUSCLES, `${e.id}: ${m}`);
    assert.equal(e.primaryMuscles.filter((m) => e.secondaryMuscles.includes(m)).length, 0, `${e.id}: muscle twice`);
    assert.equal(typeof e.sides, 'boolean', e.id);
  }
});

test('Alle in den Anforderungen genannten Übungen sind enthalten', () => {
  const required = [
    'Burpees', 'Hampelmann', 'High Knees', 'Mountain Climbers', 'Kniebeugen', 'Sprungkniebeugen', 'Ausfallschritte',
    'Skater Jumps', 'Liegestütze', 'Klimmzüge', 'Dips', 'Plank', 'Hollow Hold', 'Wall Sit', 'L-Sit',
    'Kettlebell Swing', 'Goblet Squat', 'Turkish Get-up',
  ];
  const names = new Set(EXERCISES.map((e) => e.name));
  for (const r of required) assert.ok(names.has(r), r);
});
