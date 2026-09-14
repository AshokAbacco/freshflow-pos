/**
 * Minimal promise wrapper over IndexedDB.
 * Stores:
 *   outbox     – bills waiting to upload (keyPath clientId)
 *   heldBills  – parked carts on this terminal (keyPath id)
 *   cache      – catalog / categories / settings snapshots for offline selling
 * Writes resolve only after the IDB transaction commits, so a resolved write survives a crash.
 */
const DB_NAME = 'freshflow-pos';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support offline storage'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'clientId' }).createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('heldBills')) db.createObjectStore('heldBills', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

function run(storeName, mode, operation) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = operation(tx.objectStore(storeName));
        let result;
        if (request) request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
      }),
  );
}

export const idb = {
  get: (store, key) => run(store, 'readonly', (os) => os.get(key)),
  getAll: (store) => run(store, 'readonly', (os) => os.getAll()),
  put: (store, value, key) => run(store, 'readwrite', (os) => (key === undefined ? os.put(value) : os.put(value, key))),
  delete: (store, key) => run(store, 'readwrite', (os) => os.delete(key)),
  count: (store) => run(store, 'readonly', (os) => os.count()),
};
