// Personal media: rules for the chosen files, picture scaling, and that they stay on the device.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDIA_SLOTS, MEDIA_KEYS, checkFile, checkSoundLength, fitWithin, makeMediaRecord, formatBytes,
  IMAGE_MAX_EDGE, SOUND_MAX_BYTES, SOUND_MAX_S,
} from '../js/core/media.js';
import { createDb } from '../js/storage/db.js';
import { createMemoryStore } from '../js/storage/memory.js';
import { buildBackup } from '../js/core/transfer.js';
import { STORES } from '../js/storage/schema.js';

test('Speicherplätze: ein Bild, zwei Töne, die Töne ersetzen "Rundenpause" und "Ende"', () => {
  assert.deepEqual(MEDIA_KEYS, ['background', 'sound-roundDone', 'sound-end']);
  assert.equal(MEDIA_SLOTS.background.kind, 'image');
  assert.equal(MEDIA_SLOTS['sound-roundDone'].signal, 'roundRestStart');
  assert.equal(MEDIA_SLOTS['sound-end'].signal, 'finished');
  assert.ok('media' in STORES);
});

test('Datei prüfen: Bild muss ein Bild sein, Ton höchstens 3 MB, leere Datei wird abgelehnt', () => {
  assert.doesNotThrow(() => checkFile('background', { type: 'image/jpeg', size: 4_000_000 }));
  assert.throws(() => checkFile('background', { type: 'audio/mpeg', size: 1000 }), /kein Bild/);
  assert.throws(() => checkFile('background', { type: 'image/png', size: 0 }), /leer/);
  assert.doesNotThrow(() => checkFile('sound-end', { type: 'audio/mpeg', size: 200_000 }));
  assert.doesNotThrow(() => checkFile('sound-end', { type: '', size: 200_000 })); // iOS: recording without a type
  assert.doesNotThrow(() => checkFile('sound-end', { type: 'video/mp4', size: 200_000 })); // m4a is often reported so
  assert.throws(() => checkFile('sound-end', { type: 'image/png', size: 1000 }), /keine Tondatei/);
  assert.throws(() => checkFile('sound-end', { type: 'audio/wav', size: SOUND_MAX_BYTES + 1 }), /zu groß/);
  assert.throws(() => checkFile('gibt-es-nicht', { type: 'image/png', size: 1 }), /Unbekannt/);
});

test('Tonlänge: bis 8 s erlaubt, länger oder nicht abspielbar wird abgelehnt', () => {
  assert.doesNotThrow(() => checkSoundLength(0.4));
  assert.doesNotThrow(() => checkSoundLength(SOUND_MAX_S));
  assert.throws(() => checkSoundLength(SOUND_MAX_S + 0.1), /höchstens 8 s/);
  assert.throws(() => checkSoundLength(0), /nicht abspielen/);
  assert.throws(() => checkSoundLength(NaN), /nicht abspielen/);
});

test('Bild verkleinern: längere Seite höchstens 1600 px, Seitenverhältnis bleibt, nie vergrößern', () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: IMAGE_MAX_EDGE, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 1200, height: IMAGE_MAX_EDGE });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(5000, 10), { width: 1600, height: 3 });
  assert.throws(() => fitWithin(0, 0), /keine Größe/);
});

test('Datensatz: Bytes, Typ, gekürzter Name, Tonlänge auf Zehntel', () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const r = makeMediaRecord({ type: 'audio/wav', bytes, name: 'x'.repeat(200), seconds: 2.349, now: 5 });
  assert.equal(r.name.length, 80);
  assert.equal(r.seconds, 2.3);
  assert.equal(r.savedAt, 5);
  assert.equal(r.bytes.byteLength, 3);
  assert.equal('seconds' in makeMediaRecord({ type: 'image/jpeg', bytes }), false);
  assert.throws(() => makeMediaRecord({ type: 'image/jpeg', bytes: new ArrayBuffer(0) }), /Keine Daten/);
  assert.equal(formatBytes(240 * 1024), '240 kB');
  assert.equal(formatBytes(1.3 * 1024 * 1024), '1,3 MB');
});

test('Speicher: Medien speichern, laden, entfernen; unbekannter Platz wird abgelehnt', async () => {
  const db = createDb(createMemoryStore());
  assert.deepEqual(await db.loadMedia(), { background: null, 'sound-roundDone': null, 'sound-end': null });
  const record = makeMediaRecord({ type: 'image/jpeg', bytes: new Uint8Array([9, 8, 7, 6]).buffer, name: 'foto.jpg' });
  await db.saveMedia('background', record);
  const loaded = (await db.loadMedia()).background;
  assert.equal(loaded.name, 'foto.jpg');
  assert.deepEqual([...new Uint8Array(loaded.bytes)], [9, 8, 7, 6]);
  assert.throws(() => db.saveMedia('irgendwas', record), /Unbekannter Speicherplatz/);
  await db.removeMedia('background');
  assert.equal((await db.loadMedia()).background, null);
});

test('Medien stehen nie in der Sicherung', async () => {
  const db = createDb(createMemoryStore());
  await db.saveMedia('background', makeMediaRecord({ type: 'image/jpeg', bytes: new Uint8Array(64).fill(7).buffer, name: 'geheim.jpg' }));
  await db.saveMedia('sound-end', makeMediaRecord({ type: 'audio/wav', bytes: new Uint8Array(64).fill(3).buffer, name: 'geheim.wav', seconds: 1 }));
  const data = await db.collectData();
  assert.deepEqual(Object.keys(data).sort(), ['customExercises', 'exerciseUsage', 'history', 'settings', 'templates']);
  const text = JSON.stringify(buildBackup(data));
  assert.ok(!text.includes('geheim'), 'Dateiname in der Sicherung');
  assert.ok(!text.includes('media') && !text.includes('bytes'), 'Medien in der Sicherung');
  // and an import cannot smuggle media in either
  await db.importData({ media: { background: { bytes: 'x' } }, settings: {} });
  assert.equal((await db.loadMedia())['sound-roundDone'], null);
});
