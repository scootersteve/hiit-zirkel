// App-facing facade over the low-level store. Owns the settings defaults and the small bits of
// domain IO the app needs (settings, custom exercises, usage timestamps). Pure persistence —
// validating and de-duplicating exercises lives in js/core/library.js.

import { openStore } from './store.js';
import { makeId } from '../core/id.js';
import { LOOK_IDS } from '../data/looks.js';
import { MEDIA_KEYS } from '../core/media.js';

// The app/sound/theme settings (kv: "settings"). Separate from the per-circuit timer settings
// in js/core/plan.js. Loading always merges onto these, so a new field gets its default.
export const SETTINGS_VERSION = 2;
export const DEFAULT_SETTINGS = Object.freeze({
  settingsVersion: SETTINGS_VERSION,
  soundMode: 'playback', // "Immer hörbar"; "ambient" = Musik-Modus
  volume: 0.8,
  voice: true,
  voiceURI: null,
  countdownBeeps: true,
  halfwayBeep: false,
  theme: 'auto', // "auto" follows the device, "light" / "dark" force a scheme
  look: 'standard', // design: "standard" or one of the anime-inspired looks (js/data/looks.js)
  animations: true, // moving effects of the looks (aura, speed lines); off = they stand still
});

const THEMES = ['auto', 'light', 'dark'];

/**
 * Brings settings saved by an older app version up to date WITHOUT dropping what the user chose.
 * An update must never reset settings; a changed meaning gets a step here instead.
 *   v1 → v2: "theme" was stored as 'dark' although the app offered no choice yet. It becomes
 *            'auto' (follow the device); everything else is kept as it was.
 */
export function migrateSettings(saved) {
  if (!saved || typeof saved !== 'object') return {};
  const out = { ...saved };
  const version = Number(out.settingsVersion) || 1;
  if (version < 2) out.theme = 'auto';
  if (!THEMES.includes(out.theme)) out.theme = 'auto';
  // "look" came with 0.8.0: older settings have none and get the standard design. A look this
  // version does not know (backup from a newer one) falls back to it as well.
  if (!LOOK_IDS.includes(out.look)) out.look = 'standard';
  if (typeof out.animations !== 'boolean') out.animations = true;
  out.settingsVersion = SETTINGS_VERSION;
  return out;
}

// Known keys only, so stray fields never accumulate; missing ones fall back to the default.
function cleanSettings(settings) {
  const clean = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) clean[key] = settings[key] ?? DEFAULT_SETTINGS[key];
  return clean;
}

export function createDb(store) {
  return {
    store,
    persistent: store.persistent,

    async loadSettings() {
      const saved = await store.get('kv', 'settings');
      return { ...DEFAULT_SETTINGS, ...migrateSettings(saved) };
    },
    async saveSettings(settings) {
      const clean = cleanSettings({ ...settings, settingsVersion: SETTINGS_VERSION });
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

    // Personal media (own picture, own sounds): device only. collectData below leaves them out
    // on purpose, so they never reach a backup file.
    async loadMedia() {
      const out = {};
      for (const key of MEDIA_KEYS) out[key] = (await store.get('media', key)) || null;
      return out;
    },
    saveMedia(key, record) {
      if (!MEDIA_KEYS.includes(key)) throw new Error(`Unbekannter Speicherplatz: ${key}`);
      return store.put('media', record, key);
    },
    removeMedia(key) {
      return store.delete('media', key);
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
        // a backup may come from an older app version: migrate it like stored settings
        await store.put('kv', cleanSettings(migrateSettings(data.settings)), 'settings');
      }
      return counts;
    },
  };
}

export async function openDb() {
  return createDb(await openStore());
}
