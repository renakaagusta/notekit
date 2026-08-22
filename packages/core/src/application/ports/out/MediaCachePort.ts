/**
 * Outbound port for the local media cache (#28).
 *
 * A driving adapter (e.g. the `useMediaSrc` hook) resolves a remote media URL
 * to displayable bytes through this port; the composition root binds it to the
 * IndexedDB-backed cache. Keeping the port this small (just the read the UI
 * needs) means the hook depends on a contract, not on the storage backend.
 */
export interface MediaCachePort {
  /**
   * Return cached bytes for `url`, or `null` on a miss / when the bytes cannot
   * be read (opaque cross-origin responses). Never throws for a plain miss.
   */
  getBlob(url: string): Promise<Blob | null>;
}
