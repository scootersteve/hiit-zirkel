// Single source of truth for the IndexedDB shape. Both implementations (IndexedDB and
// in-memory) and the upgrade step read the store list from here, so they can never drift apart.

export const DB_NAME = 'hiit-zirkel';
export const DB_VERSION = 1;

// keyPath !== null → the key lives inside the record (collections of records with an `id`).
// keyPath === null → out-of-line keys passed explicitly (key/value stores).
export const STORES = Object.freeze({
  customExercises: { keyPath: 'id' },
  templates: { keyPath: 'id' },
  history: { keyPath: 'id' },
  kv: { keyPath: null }, // 'settings', 'exerciseUsage'
  media: { keyPath: null }, // 'background', 'sound-roundDone', 'sound-end' (Blobs)
});
