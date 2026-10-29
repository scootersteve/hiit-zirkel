import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, encodeCircuit, decodeCircuit, BACKUP_FORMAT } from '../js/core/transfer.js';

test('buildBackup: Umschlag mit Format, Version, Zeitstempel und allen Abschnitten', () => {
  const b = buildBackup({ customExercises: [{ id: 'c-a' }], templates: [{ id: 't-a' }] }, { now: 1000 });
  assert.equal(b.format, BACKUP_FORMAT);
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, 1000);
  assert.deepEqual(b.customExercises, [{ id: 'c-a' }]);
  assert.deepEqual(b.history, []); // fehlende Abschnitte → leer
  assert.deepEqual(b.exerciseUsage, {});
});

test('parseBackup: gültig durch, falsches Format/Version werfen', () => {
  const good = buildBackup({ templates: [{ id: 't-1' }] });
  assert.deepEqual(parseBackup(good).templates, [{ id: 't-1' }]);
  assert.deepEqual(parseBackup(JSON.stringify(good)).templates, [{ id: 't-1' }]); // auch als String
  assert.throws(() => parseBackup({ format: 'anders', version: 1 }), /Keine Zirkel-Dojo-Sicherung/);
  assert.throws(() => parseBackup({ format: BACKUP_FORMAT, version: 2 }), /Version/);
  assert.throws(() => parseBackup('kein json {'), /JSON/);
  assert.throws(() => parseBackup(null), /Keine Zirkel-Dojo-Sicherung/);
});

test('parseBackup: fehlende/falsche Abschnitte werden zu leeren Defaults', () => {
  const data = parseBackup({ format: BACKUP_FORMAT, version: 1, templates: 'kaputt' });
  assert.deepEqual(data.templates, []);
  assert.deepEqual(data.customExercises, []);
  assert.deepEqual(data.settings, {});
});

test('encodeCircuit/decodeCircuit: Round-Trip mit Umlauten, Seiten und Pro-Übung-Zeit', () => {
  const circuit = {
    name: 'Kräftigung Oberkörper',
    exercises: [
      { id: 'pushups', name: 'Liegestütze', sides: false },
      { id: 'side-plank', name: 'Seitstütz', sides: true, workS: 60 },
    ],
    settings: { rounds: 3, workS: 40, restS: 20, roundRestS: 60, prepS: 10, warmupS: 0, cooldownS: 0 },
  };
  const encoded = encodeCircuit(circuit);
  assert.doesNotMatch(encoded, /[+/=]/); // url-sicher: kein +, /, =
  const decoded = decodeCircuit(encoded);
  assert.equal(decoded.name, 'Kräftigung Oberkörper');
  assert.equal(decoded.exercises.length, 2);
  assert.equal(decoded.exercises[1].sides, true);
  assert.equal(decoded.exercises[1].workS, 60);
  assert.equal(decoded.exercises[0].workS, undefined);
  assert.equal(decoded.settings.rounds, 3);
});

test('decodeCircuit: Einstellungen werden normiert, ungültige Übungen entfernt', () => {
  const encoded = encodeCircuit({
    name: 'X',
    exercises: [{ id: 'a', name: 'A' }, { id: null, name: 'kaputt' }],
    settings: { rounds: 0, workS: 0 },
  });
  const decoded = decodeCircuit(encoded);
  assert.equal(decoded.exercises.length, 1); // kaputter Eintrag raus
  assert.equal(decoded.settings.rounds, 1); // geklammert
  assert.equal(decoded.settings.workS, 1);
});

test('decodeCircuit: Müll wirft lesbar', () => {
  assert.throws(() => decodeCircuit('!!!nicht-base64!!!'), /Link/);
  const badShape = Buffer.from(JSON.stringify({ name: 'x', exercises: 'keinArray', settings: {} })).toString('base64url');
  assert.throws(() => decodeCircuit(badShape), /gültigen Zirkel/);
});
