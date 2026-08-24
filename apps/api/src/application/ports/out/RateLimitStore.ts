/**
 * Outbound port for the persistent rate-limit counter store. The rate-limit
 * middleware depends on this instead of Redis directly, so the Lua eval script
 * and key namespacing live in a driven adapter.
 */
export interface RateLimitStore {
  /** True when a backing store is configured (dev without Redis → false). */
  readonly available: boolean;

  /**
   * Atomically increment the window-scoped counter for `key`, setting the TTL
   * (`ttlMs`) on the first hit of the window. `windowStart` is the epoch-ms
   * start of the current fixed window, used to derive the per-window key.
   * Returns the post-increment count. Throws on transport failure — the caller
   * fails open on a throw.
   */
  incrementWindow(key: string, windowStart: number, ttlMs: number): Promise<number>;
}
