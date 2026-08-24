/**
 * Outbound port for the fixed-window rate-limit counter store. The rate-limit
 * middleware depends on this instead of Redis directly, so the Redis transport
 * (INCR + PEXPIRE, key namespacing, fail-open) lives in a driven adapter.
 */
export interface RateLimitStore {
  /** Whether a backing store is configured (false → the limiter fails open). */
  readonly available: boolean;

  /**
   * Atomically increment the counter for `key` within the window starting at
   * `windowStart`, setting the window's expiry to `ttlMs` on the first hit.
   * Returns the post-increment count. Throws on transport failure (the caller
   * fails open).
   */
  increment(key: string, windowStart: number, ttlMs: number): Promise<number>;
}
