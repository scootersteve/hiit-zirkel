// App-facing facade over the low-level store. Owns the settings defaults and the small bits of
// domain IO the app needs (settings, custom exercises, usage timestamps). Pure persistence —
// validating and de-duplicating exercises lives in js/core/library.js.

import { openStore } from './store.js';

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
  };
}

export async function openDb() {
  return createDb(await openStore());
}
