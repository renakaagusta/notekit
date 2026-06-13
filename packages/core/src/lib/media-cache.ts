/**
 * Local cache for remote image/pdf bytes (#28).
 *
 * The vault stores only the URL (see #25); this cache is a *derived,
 * evictable* layer so repeat opens are instant and previously-viewed
 * media works offline. The source of truth stays the URL — losing the
 * cache only costs a re-fetch.
 *
 * Design: the eviction policy lives here (pure, unit-tested with an
 * in-memory store); the bytes live behind a {@link MediaStore} backend.
 * The runtime backend is IndexedDB ({@link IndexedDbMediaStore}), which
 * works in every Chromium runtime we ship (web, Capacitor WebView,
 * Electron renderer) — so one backend covers all three. Native
 * filesystem backends can slot in later behind the same interface.
 *
 * CORS reality (#25): page-context code can only read bytes for
 * same-origin or CORS-enabled hosts. For opaque cross-origin responses
 * we cannot read the bytes here, so {@link MediaCache.getBlob} returns
 * `null` and callers fall back to the raw URL (the browser HTTP cache
 * still helps). Caching opaque cross-origin bytes needs a Service Worker
 * — a later enhancement that plugs in behind this same `getBlob` seam.
 */

export interface MediaEntry {
  key: string;
  size: number;
  /** Last-access epoch ms; the eviction order key. */
  atime: number;
}

/** Dumb key→bytes store with access metadata. The cache owns the policy. */
export interface MediaStore {
  /** Returns the blob and bumps its access time, or `null` on miss. */
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  delete(key: string): Promise<void>;
  /** All entries with size + atime, for eviction decisions. */
  entries(): Promise<MediaEntry[]>;
}

export interface MediaCacheOptions {
  store: MediaStore;
  /** Total byte budget before LRU eviction kicks in. Default 256 MiB. */
  maxBytes?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
}

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

export class MediaCache {
  private store: MediaStore;
  private maxBytes: number;
  private fetchImpl: typeof fetch;
  // Coalesce concurrent fetches of the same URL into one network call.
  private inflight = new Map<string, Promise<Blob | null>>();

  constructor(opts: MediaCacheOptions) {
    this.store = opts.store;
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    // Bind to globalThis so an extension-wrapped fetch still works (see the
    // transport fetch bug). Evaluated lazily — tests always pass fetchImpl.
    this.fetchImpl =
      opts.fetchImpl ?? (globalThis.fetch.bind(globalThis) as typeof fetch);
  }

  /**
   * Resolve a URL to cached bytes. Returns the cached blob on hit; on
   * miss fetches once, stores, enforces the budget, and returns the
   * blob. Returns `null` when the bytes can't be read (opaque
   * cross-origin, network error, offline) — callers fall back to the
   * raw URL.
   */
  async getBlob(url: string): Promise<Blob | null> {
    const hit = await this.store.get(url);
    if (hit) return hit;

    const existing = this.inflight.get(url);
    if (existing) return existing;

    const job = this.fetchAndStore(url).finally(() =>
      this.inflight.delete(url),
    );
    this.inflight.set(url, job);
    return job;
  }

  private async fetchAndStore(url: string): Promise<Blob | null> {
    let blob: Blob;
    try {
      const res = await this.fetchImpl(url);
      // Opaque (type "opaque") or error responses can't be read here.
      if (!res.ok || res.type === "opaque") return null;
      blob = await res.blob();
    } catch {
      return null;
    }
    try {
      await this.store.put(url, blob);
      await this.enforce();
    } catch {
      // A storage failure is non-fatal — we still return the bytes.
    }
    return blob;
  }

  /** Evict least-recently-accessed entries until under the byte budget. */
  private async enforce(): Promise<void> {
    const entries = await this.store.entries();
    let total = entries.reduce((n, e) => n + e.size, 0);
    if (total <= this.maxBytes) return;
    // Oldest access first.
    const byAge = [...entries].sort((a, b) => a.atime - b.atime);
    for (const e of byAge) {
      if (total <= this.maxBytes) break;
      await this.store.delete(e.key);
      total -= e.size;
    }
  }
}

/** In-memory {@link MediaStore} — the test backend and a non-persistent fallback. */
export class MemoryMediaStore implements MediaStore {
  private map = new Map<string, { blob: Blob; size: number; atime: number }>();
  constructor(private now: () => number = () => Date.now()) {}

  async get(key: string): Promise<Blob | null> {
    const rec = this.map.get(key);
    if (!rec) return null;
    rec.atime = this.now();
    return rec.blob;
  }
  async put(key: string, blob: Blob): Promise<void> {
    this.map.set(key, { blob, size: blob.size, atime: this.now() });
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async entries(): Promise<MediaEntry[]> {
    return [...this.map.entries()].map(([key, r]) => ({
      key,
      size: r.size,
      atime: r.atime,
    }));
  }
}
