/**
 * Offline-first ciphertext cache for vault files (IndexedDB).
 *
 * NoteKit is E2EE + git-backed: every note/ticket/link is an age-encrypted
 * blob, and its git blob-sha is content-addressed (identical content ⇒
 * identical sha). The server and git history already store that ciphertext, so
 * keeping a copy on-device is the *same* trust level the running app already
 * has — the age identity key lives in IndexedDB right next to it, and
 * ciphertext at rest leaks nothing without that key.
 *
 * With this cache the sync engine can:
 *   1. decrypt locally on boot — instant, zero network round-trips, and
 *   2. on refresh, `listFiles` (a cheap path+sha listing) and download only the
 *      blobs whose sha changed — a `git fetch` in spirit, not a full re-read.
 *
 * Only ciphertext is cached. Plaintext (non-E2EE) bodies are deliberately never
 * persisted, matching the notes/tickets/links store `partialize`. All ops are
 * best-effort: any IndexedDB failure resolves to a miss so sync falls back to
 * the network and never breaks.
 *
 * Records are namespaced by the active vault scope (`currentVaultScope()`), so
 * two vaults/accounts on the same device never see each other's blobs.
 */

import type { StoragePort } from "../../application/ports/out/StoragePort";

const DB_NAME = "notekit-vault-cache";
const STORE = "files";
const VERSION = 1;

export interface CachedFile {
  path: string;
  sha: string;
  content: string;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          // key = `${scope}\n${path}`; value = CachedFile (path kept for readback)
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const keyOf = (scope: string, path: string) => `${scope}\n${path}`;
/** Key range covering every record under a scope (keys are `scope\npath`). */
const scopeRange = (scope: string) =>
  IDBKeyRange.bound(`${scope}\n`, `${scope}\n￿`);

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** All cached files for a vault scope, keyed by path. Empty map on any error. */
export async function getScopeFiles(scope: string): Promise<Map<string, CachedFile>> {
  const db = await openDb();
  const out = new Map<string, CachedFile>();
  if (!db) return out;
  try {
    const tx = db.transaction(STORE, "readonly");
    const values = (await promisify(
      tx.objectStore(STORE).getAll(scopeRange(scope)),
    )) as CachedFile[];
    for (const v of values) if (v && v.path) out.set(v.path, v);
  } catch {
    /* treat as empty — sync falls back to the network */
  }
  return out;
}

/** One cached file by path, or null on miss/error. */
export async function getFile(scope: string, path: string): Promise<CachedFile | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE, "readonly");
    const v = (await promisify(tx.objectStore(STORE).get(keyOf(scope, path)))) as CachedFile | undefined;
    return v ?? null;
  } catch {
    return null;
  }
}

/** Upsert one ciphertext blob into the cache. Best-effort. */
export async function putFile(
  scope: string,
  file: CachedFile,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    await promisify(tx.objectStore(STORE).put(file, keyOf(scope, file.path)));
  } catch {
    /* ignore — cache is an accelerator, not a source of truth */
  }
}

/** Remove one path from the cache (e.g. deleted upstream). Best-effort. */
export async function removeFile(scope: string, path: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(keyOf(scope, path));
  } catch {
    /* ignore */
  }
}

/**
 * Content namespaces reconciled by the sync pull. pruneScope only ever deletes
 * within these — crypto files (`.notekit/…`), chat history (`chats/…`), and SWR
 * metadata blobs (`@…`) are cached by other paths and must survive a content
 * pull's prune.
 */
const CONTENT_PREFIXES = ["notes/", "tickets/", "journal/", "links/"];

/**
 * Drop any cached CONTENT path under `scope` that isn't in `keep` — reconciles
 * note/ticket/link deletions made on other devices. Leaves crypto/chat/metadata
 * caches untouched. Best-effort.
 */
export async function pruneScope(scope: string, keep: Set<string>): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const keys = (await promisify(store.getAllKeys(scopeRange(scope)))) as IDBValidKey[];
    for (const key of keys) {
      const path = String(key).slice(scope.length + 1);
      // Only reconcile the content namespaces the pull actually listed.
      if (!CONTENT_PREFIXES.some((p) => path.startsWith(p))) continue;
      if (!keep.has(path)) store.delete(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Conformance: this storage module IS the concrete {@link StoragePort} — the
 * ciphertext caching capability the application depends on. Compile-time
 * `satisfies` guarantees the adapter never drifts from the port contract.
 * Composition roots will inject this where a `StoragePort` is required.
 */
export const vaultCacheStoragePort = {
  getScopeFiles,
  getFile,
  putFile,
  removeFile,
  pruneScope,
} satisfies StoragePort;
