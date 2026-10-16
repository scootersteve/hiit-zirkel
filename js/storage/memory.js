// In-memory implementation of the store interface. Used for `node --test` and as a fallback
// when IndexedDB is unavailable (private mode, blocked upgrade). Values are cloned on the way
// in and out, so callers cannot mutate stored records by reference — same semantics as IndexedDB.

import { STORES } from './schema.js';

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

export function createMemoryStore() {
  const maps = new Map();
  for (const name of Object.keys(STORES)) maps.set(name, new Map());

  const mapFor = (name) => {
    const map = maps.get(name);
    if (!map) throw new Error(`Unknown store: ${name}`);
    return map;
  };

  const keyFor = (name, value, key) => {
    const { keyPath } = STORES[name];
    return keyPath ? value?.[keyPath] : key;
  };

  return {
    persistent: false,
    async all(name) {
      return Array.from(mapFor(name).values()).map(clone);
    },
    async get(name, key) {
      return clone(mapFor(name).get(key));
    },
    async put(name, value, key) {
      const map = mapFor(name);
      const k = keyFor(name, value, key);
      if (k === undefined || k === null) throw new Error(`Missing key for store "${name}"`);
      map.set(k, clone(value));
      return k;
    },
    async delete(name, key) {
      mapFor(name).delete(key);
    },
    async clear(name) {
      mapFor(name).clear();
    },
    close() {},
  };
}
