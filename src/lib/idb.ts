// Simple IndexedDB wrapper for caching audio chunks + draft transcript.
const DB_NAME = "courtroom-cache";
const STORE = "sessions";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface CachedSession {
  id: string;
  caseId: string;
  audioBlob?: Blob;
  audioMime?: string;
  transcript: unknown[];
  bookmarks: unknown[];
  durationSeconds: number;
  updatedAt: number;
}

export async function saveCache(s: CachedSession): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(s);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadCache(id: string): Promise<CachedSession | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => res(req.result as CachedSession | undefined);
    req.onerror = () => rej(req.error);
  });
}

export async function clearCache(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
