import {
  MediaCache,
  MemoryMediaStore,
  type MediaStore,
  type MediaEntry,
} from "./media-cache";

/**
 * IndexedDB-backed {@link MediaStore} — the runtime default (#28).
 *
 * Works in every Chromium runtime we ship (web, Capacitor WebView,
 * Electron renderer), so a single backend covers all three. Records
 * hold the blob, its byte size, and a last-access time so the cache's
 * LRU eviction can run off `entries()`.
 */
const DB_NAME = "notekit-media";
const STORE = "blobs";

interface Record_ {
  blob: Blob;
  size: number;
  atime: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbMediaStore implements MediaStore {
  private dbp = openDb();

  async get(key: string): Promise<Blob | null> {
    const db = await this.dbp;
    const rec = await tx<Record_ | undefined>(db, "readonly", (s) =>
      s.get(key),
    );
    if (!rec) return null;
    // Bump atime; best-effort, don't block the read on it.
    void tx(db, "readwrite", (s) =>
      s.put({ ...rec, atime: Date.now() }, key),
    ).catch(() => {});
    return rec.blob;
  }

  async put(key: string, blob: Blob): Promise<void> {
    const db = await this.dbp;
    const rec: Record_ = { blob, size: blob.size, atime: Date.now() };
    await tx(db, "readwrite", (s) => s.put(rec, key));
  }

  async delete(key: string): Promise<void> {
    const db = await this.dbp;
    await tx(db, "readwrite", (s) => s.delete(key));
  }

  async entries(): Promise<MediaEntry[]> {
    const db = await this.dbp;
    const keys = await tx<IDBValidKey[]>(db, "readonly", (s) =>
      s.getAllKeys(),
    );
    const recs = await tx<Record_[]>(db, "readonly", (s) => s.getAll());
    return recs.map((r, i) => ({
      key: String(keys[i]),
      size: r.size,
      atime: r.atime,
    }));
  }
}

let singleton: MediaCache | null = null;

/**
 * Process-wide media cache. Uses IndexedDB when available, falling back
 * to an in-memory store (e.g. private-mode quirks, non-browser test
 * runs). Safe to call from any runtime.
 */
export function getMediaCache(): MediaCache {
  if (singleton) return singleton;
  const hasIdb =
    typeof indexedDB !== "undefined" && typeof Blob !== "undefined";
  const store: MediaStore = hasIdb
    ? new IndexedDbMediaStore()
    : new MemoryMediaStore();
  singleton = new MediaCache({ store });
  return singleton;
}
