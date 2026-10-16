// IndexedDB implementation of the store interface (browser only). Every call resolves on the
// transaction's `complete` event, not just the request's `success`, so a resolved Promise means
// the data really hit disk.

import { DB_NAME, DB_VERSION, STORES } from './schema.js';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, cfg.keyPath ? { keyPath: cfg.keyPath } : undefined);
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open tab'));
  });
}

function run(db, name, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    let result;
    const request = action(tx.objectStore(name));
    if (request) request.onsuccess = () => (result = request.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function openIndexedDbStore() {
  const db = await openDatabase();
  // If another tab triggers a newer version, let it through instead of holding it hostage.
  db.onversionchange = () => db.close();
  return {
    persistent: true,
    all(name) {
      return run(db, name, 'readonly', (store) => store.getAll());
    },
    get(name, key) {
      return run(db, name, 'readonly', (store) => store.get(key));
    },
    put(name, value, key) {
      return run(db, name, 'readwrite', (store) => (key === undefined ? store.put(value) : store.put(value, key)));
    },
    delete(name, key) {
      return run(db, name, 'readwrite', (store) => store.delete(key));
    },
    clear(name) {
      return run(db, name, 'readwrite', (store) => store.clear());
    },
    close() {
      db.close();
    },
  };
}
