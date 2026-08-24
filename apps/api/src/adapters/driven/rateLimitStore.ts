/**
 * Redis-backed {@link RateLimitStore}. Counters are persistent (survive API
 * restarts) and correct across processes. Keys carry the `notekit:` prefix + a
 * TTL, so Redis expires them for us (no cleanup) and the shared instance stays
 * collision-free.
 */
import type { RateLimitStore } from "../../application/ports/out/RateLimitStore";
import { redis, REDIS_PREFIX } from "./redis";

// Atomic INCR + set-expiry-on-first-hit for the current window, in one call.
const INCR_WINDOW = `
  local c = redis.call('INCR', KEYS[1])
  if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
  return c
`;

export const rateLimitStore: RateLimitStore = {
  available: redis !== null,
  async incrementWindow(key, windowStart, ttlMs) {
    if (!redis) throw new Error("rate_limit_store_unavailable");
    // Window-scoped key (Redis expires it at window end → no cleanup).
    const redisKey = `${REDIS_PREFIX}rl:${key}:${windowStart}`;
    return Number(await redis.eval(INCR_WINDOW, 1, redisKey, String(ttlMs)));
  },
};
