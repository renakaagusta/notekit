/**
 * Outbound port for a local, content-addressed cache of vault ciphertext.
 *
 * A vault file's git blob sha (returned by both `listFiles` and `readFile`) is
 * a content hash, so caching the `.age` bytes keyed by that sha can never go
 * stale: a changed file gets a new sha, which keys a different (missing) object
 * and forces a refetch. There is no invalidation to get wrong. Only ciphertext
 * is ever stored — plaintext is decrypted in memory per command and never
 * persisted.
 *
 * The scan functions in `vault-e2ee.ts` consult an optional cache; a driving
 * adapter (the CLI) binds a disk-backed implementation, so unchanged files are
 * never re-downloaded. See docs/2026-08-27-cli-vault-ciphertext-cache.md.
 */
export interface VaultCiphertextCache {
  /** Ciphertext previously stored under `sha`, or undefined on a miss. */
  get(sha: string): Promise<string | undefined>;
  /** Store ciphertext under its blob `sha`. Immutable, so this is idempotent. */
  put(sha: string, ciphertext: string): Promise<void>;
}

/** In-memory cache — the default reference implementation and test double. */
export function createInMemoryCiphertextCache(): VaultCiphertextCache {
  const store = new Map<string, string>();
  return {
    async get(sha) {
      return store.get(sha);
    },
    async put(sha, ciphertext) {
      store.set(sha, ciphertext);
    },
  };
}
