import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fold,
  byName,
  combineExercises,
  filterExercises,
  findDuplicate,
  generateId,
  makeCustomExercise,
  updateCustomExercise,
} from '../js/core/library.js';
import { EXERCISES } from '../js/data/exercises.js';

test('fold: Kleinschreibung, Umlaute, ß, Leerzeichen', () => {
  assert.equal(fold('Überkopf'), 'uberkopf');
  assert.equal(fold('Füße'), 'fusse');
  assert.equal(fold('  Mountain   Climbers '), 'mountain climbers');
  assert.equal(fold('Crème'), 'creme');
});

test('combineExercises: eingebaute zuerst (custom:false), eigene danach (custom:true)', () => {
  const combined = combineExercises([{ id: 'c-a', name: 'Eigene' }]);
  assert.equal(combined.length, EXERCISES.length + 1);
  assert.equal(combined[0].custom, false);
  assert.equal(combined.at(-1).custom, true);
  assert.equal(combined.at(-1).name, 'Eigene');
});

test('filterExercises: Suche ist umlaut-unempfindlich, Filter kombinierbar, leer = alles', () => {
  const list = combineExercises();
  assert.equal(filterExercises(list, {}).length, list.length);
  // "Klimmzuge" findet "Klimmzüge"
  assert.ok(filterExercises(list, { query: 'klimmzuge' }).some((e) => e.name === 'Klimmzüge'));
  const kettlebell = filterExercises(list, { equipment: 'kettlebell' });
  assert.ok(kettlebell.length > 0 && kettlebell.every((e) => e.equipment === 'kettlebell'));
  const core = filterExercises(list, { category: 'core' });
  assert.ok(core.length > 0 && core.every((e) => e.category === 'core'));
  // Kategorie + Suche zusammen
  const planks = filterExercises(list, { category: 'core', query: 'plank' });
  assert.ok(planks.every((e) => e.category === 'core' && fold(e.name).includes('plank')));
});

test('findDuplicate: ignoriert Groß-/Kleinschreibung, Leerzeichen und Umlaute', () => {
  const list = combineExercises();
  assert.equal(findDuplicate(list, 'LIEGESTÜTZE').name, 'Liegestütze');
  assert.equal(findDuplicate(list, '  mountain climbers  ').name, 'Mountain Climbers');
  assert.equal(findDuplicate(list, 'Gibt es nicht'), null);
});

test('generateId: Format c-xxxx, meidet vorhandene, viele eindeutig', () => {
  const id = generateId();
  assert.match(id, /^c-[a-z0-9]{4}$/);
  assert.equal(generateId(['c-aaaa']) === 'c-aaaa', false);
  const ids = new Set();
  for (let i = 0; i < 1000; i++) ids.add(generateId([...ids]));
  assert.equal(ids.size, 1000); // keine Kollisionen, weil vorhandene gemieden werden
});

test('makeCustomExercise: Pflichtname, Defaults, Muskel-Bereinigung, Zeitstempel', () => {
  const ex = makeCustomExercise(
    {
      name: '  Pistol Squat  ',
      category: 'lower',
      equipment: 'none',
      primaryMuscles: ['quadriceps', 'quadriceps', 'nonsense'],
      secondaryMuscles: ['gluteal', 'quadriceps'], // quadriceps schon primär → raus
      sides: true,
    },
    { existingIds: [], now: 1000 },
  );
  assert.match(ex.id, /^c-/);
  assert.equal(ex.name, 'Pistol Squat'); // getrimmt
  assert.equal(ex.category, 'lower');
  assert.deepEqual(ex.primaryMuscles, ['quadriceps']); // Dublette & Unbekanntes entfernt
  assert.deepEqual(ex.secondaryMuscles, ['gluteal']); // keine Überschneidung mit primär
  assert.equal(ex.sides, true);
  assert.equal(ex.custom, true);
  assert.equal(ex.createdAt, 1000);
  assert.equal(ex.updatedAt, 1000);
});

test('makeCustomExercise: leerer Name wirft, ungültige Kategorie/Ausrüstung → Standard', () => {
  assert.throws(() => makeCustomExercise({ name: '   ' }));
  assert.throws(() => makeCustomExercise({}));
  const ex = makeCustomExercise({ name: 'Test', category: 'xx', equipment: 'yy' });
  assert.equal(ex.category, 'full');
  assert.equal(ex.equipment, 'none');
  assert.deepEqual(ex.primaryMuscles, []);
});

test('updateCustomExercise: id und createdAt bleiben, updatedAt steigt, Felder ändern sich', () => {
  const created = makeCustomExercise({ name: 'Alt', category: 'core' }, { now: 1000 });
  const updated = updateCustomExercise(created, { name: 'Neu', category: 'upper', sides: true }, { now: 2000 });
  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, 1000);
  assert.equal(updated.updatedAt, 2000);
  assert.equal(updated.name, 'Neu');
  assert.equal(updated.category, 'upper');
  assert.equal(updated.sides, true);
});

test('byName: deutsche Sortierung', () => {
  const sorted = ['Ähre', 'Apfel', 'Zebra'].map((name) => ({ name })).sort(byName);
  assert.deepEqual(sorted.map((e) => e.name), ['Ähre', 'Apfel', 'Zebra']);
});
