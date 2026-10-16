import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newCircuit,
  exerciseSnapshot,
  isUniform,
  moveItem,
  removeAt,
  applyUniformTimes,
  setExerciseWorkS,
  makeTemplate,
  updateTemplate,
  circuitFromTemplate,
  historyFromResult,
} from '../js/core/circuit.js';

const snap = (id, workS) => ({ id, name: id, sides: false, ...(workS != null ? { workS } : {}) });

test('newCircuit: leer mit Standard-Einstellungen', () => {
  const c = newCircuit();
  assert.deepEqual(c.exercises, []);
  assert.equal(c.name, '');
  assert.equal(c.settings.rounds, 3);
  assert.equal(c.settings.workS, 40);
});

test('exerciseSnapshot: nur id/name/sides, sides als Boolean', () => {
  assert.deepEqual(exerciseSnapshot({ id: 'plank', name: 'Plank', sides: 1, category: 'core' }), { id: 'plank', name: 'Plank', sides: true });
});

test('isUniform: true ohne workS, false sobald eine Übung workS hat', () => {
  assert.equal(isUniform({ exercises: [snap('a'), snap('b')] }), true);
  assert.equal(isUniform({ exercises: [snap('a'), snap('b', 60)] }), false);
});

test('moveItem: hoch/runter, Grenzen sind No-Op', () => {
  const list = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(list, 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(list, 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(moveItem(list, 0, -1), ['a', 'b', 'c']); // raus oben → unverändert
  assert.deepEqual(moveItem(list, 2, 1), ['a', 'b', 'c']); // raus unten → unverändert
  assert.deepEqual(list, ['a', 'b', 'c']); // Original unberührt
});

test('removeAt: entfernt an Index', () => {
  assert.deepEqual(removeAt(['a', 'b', 'c'], 1), ['a', 'c']);
});

test('applyUniformTimes: an=workS entfernen, aus=Standard einsetzen, eigene behalten', () => {
  const list = [snap('a'), snap('b', 60)];
  assert.deepEqual(applyUniformTimes(list, true, 40), [snap('a'), { id: 'b', name: 'b', sides: false }]);
  const off = applyUniformTimes([snap('a'), snap('b', 60)], false, 40);
  assert.equal(off[0].workS, 40); // bekam Standard
  assert.equal(off[1].workS, 60); // eigene behalten
});

test('setExerciseWorkS: setzt und klammert (ganze Zahl, min 1)', () => {
  const list = [snap('a'), snap('b')];
  assert.equal(setExerciseWorkS(list, 1, 75)[1].workS, 75);
  assert.equal(setExerciseWorkS(list, 1, 0)[1].workS, 1);
  assert.equal(setExerciseWorkS(list, 0, 30.6)[0].workS, 31);
});

test('makeTemplate: Form, Name-Fallback, normierte Einstellungen, workS geklammert, Zeitstempel', () => {
  const circuit = {
    name: '   ',
    exercises: [{ id: 'a', name: 'A', sides: true }, { id: 'b', name: 'B', sides: false, workS: 0 }],
    settings: { rounds: 0, workS: 40, restS: -5, roundRestS: 60, prepS: 10 },
  };
  const t = makeTemplate(circuit, { now: 1000 });
  assert.match(t.id, /^t-[a-z0-9]{4}$/);
  assert.equal(t.name, 'Mein Zirkel'); // leerer Name → Fallback
  assert.equal(t.sample, false);
  assert.equal(t.createdAt, 1000);
  assert.equal(t.updatedAt, 1000);
  assert.equal(t.lastUsedAt, 1000);
  assert.equal(t.settings.rounds, 1); // geklammert
  assert.equal(t.settings.restS, 0);
  assert.equal(t.exercises[0].workS, undefined); // keine eigene Zeit → nicht gespeichert
  assert.equal(t.exercises[1].workS, 1); // 0 → min 1
});

test('updateTemplate: id/createdAt/lastUsedAt bleiben, updatedAt steigt', () => {
  const created = makeTemplate({ name: 'Alt', exercises: [snap('a')], settings: {} }, { now: 1000 });
  const updated = updateTemplate(created, { name: 'Neu', exercises: [snap('a'), snap('b')], settings: {} }, { now: 2000 });
  assert.equal(updated.id, created.id);
  assert.equal(updated.createdAt, 1000);
  assert.equal(updated.lastUsedAt, 1000);
  assert.equal(updated.updatedAt, 2000);
  assert.equal(updated.name, 'Neu');
  assert.equal(updated.exercises.length, 2);
});

test('circuitFromTemplate: Metadaten weg, eigenständige Kopien', () => {
  const t = makeTemplate({ name: 'X', exercises: [snap('a', 50)], settings: {} }, { now: 1000 });
  const c = circuitFromTemplate(t);
  assert.equal(c.id, t.id);
  assert.equal(c.name, 'X');
  assert.equal('createdAt' in c, false);
  c.exercises[0].workS = 99;
  assert.equal(t.exercises[0].workS, 50); // Kopie, kein geteilter Verweis
});

test('historyFromResult: Snapshot, Rundung, Status, keine id', () => {
  const result = {
    circuit: { name: 'Lauf', exercises: [{ id: 'a', name: 'A', sides: true, workS: 60 }], settings: { rounds: 3, workS: 40 } },
    startedAt: 5000,
    endedAt: 9400,
    plannedMs: 20100,
    actualMs: 18760,
    roundsCompleted: 2,
    status: 'aborted',
  };
  const h = historyFromResult(result, { templateId: 't-abcd', now: 0 });
  assert.equal('id' in h, false); // id kommt aus der Datenschicht
  assert.equal(h.templateId, 't-abcd');
  assert.equal(h.plannedS, 20); // 20100 → 20
  assert.equal(h.actualS, 19); // 18760 → 19
  assert.equal(h.roundsCompleted, 2);
  assert.equal(h.status, 'aborted');
  assert.equal(h.circuit.exercises[0].workS, 60);
  // unbekannter Status → completed
  assert.equal(historyFromResult({ ...result, status: 'finished' }).status, 'completed');
});
