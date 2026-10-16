import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/storage/memory.js';
import { createDb, DEFAULT_SETTINGS } from '../js/storage/db.js';

// The contract every store implementation must satisfy. In node we run it against the in-memory
// store; the same function can be pointed at the IndexedDB store from a browser.
async function runStoreContract(makeStore) {
  const store = makeStore();

  // keyPath store: key lives in the record
  assert.deepEqual(await store.all('customExercises'), []);
  assert.equal(await store.get('customExercises', 'c-1'), undefined);
  const key = await store.put('customExercises', { id: 'c-1', name: 'Burpees' });
  assert.equal(key, 'c-1');
  assert.deepEqual(await store.get('customExercises', 'c-1'), { id: 'c-1', name: 'Burpees' });

  // put is an upsert
  await store.put('customExercises', { id: 'c-1', name: 'Burpees XL' });
  assert.equal((await store.get('customExercises', 'c-1')).name, 'Burpees XL');
  await store.put('customExercises', { id: 'c-2', name: 'Plank' });
  assert.equal((await store.all('customExercises')).length, 2);

  // out-of-line store: key passed explicitly
  await store.put('kv', { volume: 0.5 }, 'settings');
  assert.deepEqual(await store.get('kv', 'settings'), { volume: 0.5 });

  // stored values are copies, not references
  const mutable = { id: 'c-3', name: 'Dips', tags: ['a'] };
  await store.put('customExercises', mutable);
  mutable.name = 'MUTATED';
  mutable.tags.push('b');
  const fetched = await store.get('customExercises', 'c-3');
  assert.equal(fetched.name, 'Dips');
  assert.deepEqual(fetched.tags, ['a']);
  fetched.tags.push('c'); // mutating a result must not leak back either
  assert.deepEqual((await store.get('customExercises', 'c-3')).tags, ['a']);

  // delete and clear
  await store.delete('customExercises', 'c-1');
  assert.equal(await store.get('customExercises', 'c-1'), undefined);
  await store.clear('customExercises');
  assert.deepEqual(await store.all('customExercises'), []);

  // guard rails
  await assert.rejects(() => store.put('customExercises', { name: 'no id' })); // keyPath store needs id
  await assert.rejects(() => store.get('nope', 'x')); // unknown store
  store.close();
}

test('Speicher-Contract: In-Memory-Umsetzung', async () => {
  await runStoreContract(createMemoryStore);
});

test('Einstellungen: Standardwerte, wenn nichts gespeichert ist', async () => {
  const db = createDb(createMemoryStore());
  assert.deepEqual(await db.loadSettings(), { ...DEFAULT_SETTINGS });
});

test('Einstellungen: speichern und laden, neue Felder bekommen Standardwert', async () => {
  const store = createMemoryStore();
  // ein alter Stand ohne das Feld "theme"
  await store.put('kv', { soundMode: 'ambient', volume: 0.3, theme: undefined }, 'settings');
  const db = createDb(store);
  await db.saveSettings({ soundMode: 'ambient', volume: 0.3, voice: false });
  const loaded = await db.loadSettings();
  assert.equal(loaded.soundMode, 'ambient');
  assert.equal(loaded.volume, 0.3);
  assert.equal(loaded.voice, false);
  assert.equal(loaded.theme, DEFAULT_SETTINGS.theme); // fehlendes Feld → Standard
});

test('Einstellungen: fremde Felder werden beim Speichern verworfen', async () => {
  const db = createDb(createMemoryStore());
  await db.saveSettings({ ...DEFAULT_SETTINGS, hacked: true });
  const loaded = await db.loadSettings();
  assert.equal('hacked' in loaded, false);
});

test('Eigene Übungen: anlegen, auflisten, löschen', async () => {
  const db = createDb(createMemoryStore());
  assert.deepEqual(await db.listCustomExercises(), []);
  await db.saveCustomExercise({ id: 'c-a', name: 'Eigene A' });
  await db.saveCustomExercise({ id: 'c-b', name: 'Eigene B' });
  assert.equal((await db.listCustomExercises()).length, 2);
  await db.removeCustomExercise('c-a');
  const rest = await db.listCustomExercises();
  assert.deepEqual(rest.map((e) => e.id), ['c-b']);
});

test('Nutzungszeiten: touchen setzt Zeitstempel, bestehende bleiben', async () => {
  const db = createDb(createMemoryStore());
  assert.deepEqual(await db.getExerciseUsage(), {});
  await db.touchExerciseUsage('burpees', 1000);
  await db.touchExerciseUsage('squats', 2000);
  await db.touchExerciseUsage('burpees', 3000);
  assert.deepEqual(await db.getExerciseUsage(), { burpees: 3000, squats: 2000 });
});

test('Vorlagen: speichern, auflisten, lastUsedAt touchen, löschen', async () => {
  const db = createDb(createMemoryStore());
  assert.deepEqual(await db.listTemplates(), []);
  await db.saveTemplate({ id: 't-1', name: 'A', exercises: [], settings: {}, lastUsedAt: 1000 });
  await db.saveTemplate({ id: 't-2', name: 'B', exercises: [], settings: {}, lastUsedAt: 2000 });
  assert.equal((await db.listTemplates()).length, 2);
  const touched = await db.touchTemplate('t-1', 5000);
  assert.equal(touched.lastUsedAt, 5000);
  assert.equal((await db.listTemplates()).find((t) => t.id === 't-1').lastUsedAt, 5000);
  assert.equal(await db.touchTemplate('gibt-es-nicht', 9000), null);
  await db.removeTemplate('t-2');
  assert.deepEqual((await db.listTemplates()).map((t) => t.id), ['t-1']);
});

test('Verlauf: hinzufügen vergibt id, auflisten, löschen, leeren', async () => {
  const db = createDb(createMemoryStore());
  const a = await db.addHistory({ startedAt: 1000, status: 'completed', circuit: { name: 'X' } });
  const b = await db.addHistory({ startedAt: 2000, status: 'aborted', circuit: { name: 'Y' } });
  assert.match(a.id, /^h-[a-z0-9]{4}$/);
  assert.notEqual(a.id, b.id);
  assert.equal((await db.listHistory()).length, 2);
  // vorhandene id wird respektiert
  const c = await db.addHistory({ id: 'h-fix0', startedAt: 3000, status: 'completed', circuit: { name: 'Z' } });
  assert.equal(c.id, 'h-fix0');
  await db.removeHistory(a.id);
  assert.equal((await db.listHistory()).length, 2);
  await db.clearHistory();
  assert.deepEqual(await db.listHistory(), []);
});
