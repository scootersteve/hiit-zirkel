// Picks the best available store and re-exports the schema. One entry point for the whole app.

import { createMemoryStore } from './memory.js';
import { openIndexedDbStore } from './indexeddb.js';

export { DB_NAME, DB_VERSION, STORES } from './schema.js';

/**
 * IndexedDB in the browser; an in-memory fallback when it is missing or blocked (private mode,
 * tests). The app keeps working either way — only persistence across reloads is lost with the
 * fallback. `store.persistent` tells callers which one they got.
 */
export async function openStore() {
  if (typeof indexedDB !== 'undefined') {
    try {
      return await openIndexedDbStore();
    } catch (err) {
      console.warn('IndexedDB nicht verfügbar, nutze flüchtigen Speicher:', err);
    }
  }
  return createMemoryStore();
}
