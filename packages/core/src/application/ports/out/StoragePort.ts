/**
 * Outbound port for ciphertext caching (IndexedDB). Use cases depend on this
 * instead of accessing IndexedDB directly, so storage is injectable and can be
 * replaced by the composition root (in-memory store in tests, persistent in
 * the browser, etc).
 *
 * The cache holds E2EE ciphertext blobs keyed by git blob-sha, enabling
 * offline-first boot and efficient delta-pulls. Plaintext is never persisted.
 */

export interface CachedFile {
  path: string;
  sha: string;
  content: string;
}

export interface StoragePort {
  /**
   * All cached files for a vault scope, keyed by path.
   * Returns an empty map on any error (cache is best-effort).
   */
  getScopeFiles(scope: string): Promise<Map<string, CachedFile>>;

  /**
   * One cached file by path, or null on miss/error.
   */
  getFile(scope: string, path: string): Promise<CachedFile | null>;

  /**
   * Upsert one ciphertext blob into the cache. Best-effort.
   */
  putFile(scope: string, file: CachedFile): Promise<void>;

  /**
   * Remove one path from the cache (e.g. deleted upstream). Best-effort.
   */
  removeFile(scope: string, path: string): Promise<void>;

  /**
   * Drop any cached CONTENT path under scope that isn't in keep.
   * Leaves crypto/chat/metadata caches untouched. Best-effort.
   */
  pruneScope(scope: string, keep: Set<string>): Promise<void>;
}
