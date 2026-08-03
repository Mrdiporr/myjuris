// Simple IndexedDB wrapper for caching audio chunks + draft transcript.
const DB_NAME = "courtroom-cache";
const STORE = "sessions";
const CHUNK_STORE = "chunks";
const VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        const s = db.createObjectStore(CHUNK_STORE, { keyPath: "key" });
        s.createIndex("bySession", "sessionId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type UploadState = "none" | "pending" | "uploaded";

export interface CachedSession {
  id: string;
  caseId: string;
  audioBlob?: Blob;
  audioMime?: string;
  transcript: unknown[];
  bookmarks: unknown[];
  durationSeconds: number;
  updatedAt: number;
  uploadState?: UploadState;
}

export interface CachedChunk {
  key: string; // `${sessionId}:${index padded}`
  sessionId: string;
  index: number;
  mime: string;
  blob: Blob;
  at: number;
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
  await clearChunks(id);
}

/** Append a single recorder chunk as it arrives, so a refresh mid-recording never loses audio. */
export async function appendChunk(sessionId: string, index: number, blob: Blob, mime: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(CHUNK_STORE, "readwrite");
    tx.objectStore(CHUNK_STORE).put({
      key: `${sessionId}:${String(index).padStart(6, "0")}`,
      sessionId,
      index,
      mime,
      blob,
      at: Date.now(),
    } satisfies CachedChunk);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** Rebuild a blob from streamed chunks, or undefined when none are cached. */
export async function loadChunkBlob(sessionId: string): Promise<{ blob: Blob; mime: string } | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  const db = await openDb();
  const rows = await new Promise<CachedChunk[]>((res, rej) => {
    const tx = db.transaction(CHUNK_STORE, "readonly");
    const req = tx.objectStore(CHUNK_STORE).index("bySession").getAll(sessionId);
    req.onsuccess = () => res((req.result as CachedChunk[]) ?? []);
    req.onerror = () => rej(req.error);
  });
  if (!rows.length) return undefined;
  rows.sort((a, b) => a.index - b.index);
  const mime = rows[0].mime || "audio/webm";
  return { blob: new Blob(rows.map((r) => r.blob), { type: mime }), mime };
}

export async function clearChunks(sessionId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  const keys = await new Promise<IDBValidKey[]>((res, rej) => {
    const tx = db.transaction(CHUNK_STORE, "readonly");
    const req = tx.objectStore(CHUNK_STORE).index("bySession").getAllKeys(sessionId);
    req.onsuccess = () => res(req.result ?? []);
    req.onerror = () => rej(req.error);
  });
  if (!keys.length) return;
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(CHUNK_STORE, "readwrite");
    const store = tx.objectStore(CHUNK_STORE);
    keys.forEach((k) => store.delete(k as IDBValidKey));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
