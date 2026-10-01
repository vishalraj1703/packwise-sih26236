// Minimal promise-based IndexedDB key-value store for offline data (results, pending records).
// Falls back to memory if IndexedDB is unavailable (private mode, blocked storage).

const DB_NAME = "packwise";
const STORE = "kv";
let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, unknown>();

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export const idb = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const v = await tx<T>("readonly", (s) => s.get(key) as IDBRequest<T>);
    if (v !== undefined) return v;
    return (memory.has(key) ? (memory.get(key) as T) : fallback);
  },
  async set(key: string, value: unknown): Promise<void> {
    memory.set(key, value);
    await tx("readwrite", (s) => s.put(value, key));
  },
  async del(key: string): Promise<void> {
    memory.delete(key);
    await tx("readwrite", (s) => s.delete(key));
  }
};
