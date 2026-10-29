// App-facing facade over the low-level store. Owns the settings defaults and the small bits of
// domain IO the app needs (settings, custom exercises, usage timestamps). Pure persistence —
// validating and de-duplicating exercises lives in js/core/library.js.

import { openStore } from './store.js';
import { makeId } from '../core/id.js';

// The app/sound/theme settings (kv: "settings"). Separate from the per-circuit timer settings
// in js/core/plan.js. Loading always merges onto these, so a new field gets its default.
export const DEFAULT_SETTINGS = Object.freeze({
  soundMode: 'playback', // "Immer hörbar"; "ambient" = Musik-Modus
  volume: 0.8,
  voice: true,
  voiceURI: null,
  countdownBeeps: true,
  halfwayBeep: false,
  theme: 'dark',
  animations: true,
});

export function createDb(store) {
  return {
    store,
    persistent: store.persistent,

    async loadSettings() {
      const saved = await store.get('kv', 'settings');
      return { ...DEFAULT_SETTINGS, ...(saved || {}) };
    },
    // Keeps only known keys so stray fields never accumulate; missing ones fall back to default.
    async saveSettings(settings) {
      const clean = {};
      for (const key of Object.keys(DEFAULT_SETTINGS)) clean[key] = settings[key] ?? DEFAULT_SETTINGS[key];
      await store.put('kv', clean, 'settings');
      return clean;
    },

    listCustomExercises() {
      return store.all('customExercises');
    },
    saveCustomExercise(exercise) {
      return store.put('customExercises', exercise);
    },
    removeCustomExercise(id) {
      return store.delete('customExercises', id);
    },

    async getExerciseUsage() {
      return (await store.get('kv', 'exerciseUsage')) || {};
    },
    async touchExerciseUsage(id, at = Date.now()) {
      const usage = (await store.get('kv', 'exerciseUsage')) || {};
      usage[id] = at;
      await store.put('kv', usage, 'exerciseUsage');
      return usage;
    },

    listTemplates() {
      return store.all('templates');
    },
    saveTemplate(template) {
      return store.put('templates', template);
    },
    removeTemplate(id) {
      return store.delete('templates', id);
    },
    async touchTemplate(id, at = Date.now()) {
      const template = await store.get('templates', id);
      if (!template) return null;
      template.lastUsedAt = at;
      await store.put('templates', template);
      return template;
    },

    listHistory() {
      return store.all('history');
    },
    // Assigns a collision-free id if the record has none.
    async addHistory(record) {
      const existing = await store.all('history');
      const entry = record.id ? record : { ...record, id: makeId('h', existing.map((e) => e.id)) };
      await store.put('history', entry);
      return entry;
    },
    removeHistory(id) {
      return store.delete('history', id);
    },
    clearHistory() {
      return store.clear('history');
    },

    async collectData() {
      const [customExercises, templates, history, exerciseUsage, settings] = await Promise.all([
        store.all('customExercises'),
        store.all('templates'),
        store.all('history'),
        store.get('kv', 'exerciseUsage'),
        store.get('kv', 'settings'),
      ]);
      return { customExercises, templates, history, exerciseUsage: exerciseUsage || {}, settings: settings || {} };
    },
    // Merge import: records go in by id (overwrite same id), usage keeps the newer timestamp,
    // settings apply over the defaults. Re-importing the same backup is idempotent.
    async importData(data) {
      const counts = { customExercises: 0, templates: 0, history: 0 };
      for (const e of data.customExercises || []) if (e && e.id != null) { await store.put('customExercises', e); counts.customExercises++; }
      for (const t of data.templates || []) if (t && t.id != null) { await store.put('templates', t); counts.templates++; }
      for (const h of data.history || []) if (h && h.id != null) { await store.put('history', h); counts.history++; }
      if (data.exerciseUsage && Object.keys(data.exerciseUsage).length) {
        const usage = (await store.get('kv', 'exerciseUsage')) || {};
        for (const [id, at] of Object.entries(data.exerciseUsage)) usage[id] = Math.max(usage[id] || 0, at || 0);
        await store.put('kv', usage, 'exerciseUsage');
      }
      if (data.settings && Object.keys(data.settings).length) {
        const clean = {};
        for (const key of Object.keys(DEFAULT_SETTINGS)) clean[key] = data.settings[key] ?? DEFAULT_SETTINGS[key];
        await store.put('kv', clean, 'settings');
      }
      return counts;
    },
  };
}

export async function openDb() {
  return createDb(await openStore());
}
