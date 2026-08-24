import type { RateLimitStore } from "../../application/ports/out/RateLimitStore";
import { redis, REDIS_PREFIX } from "./redis";

// Atomic INCR + set-expiry-on-first-hit for the current window, in one call.
const INCR_WINDOW = `
  local c = redis.call('INCR', KEYS[1])
  if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
  return c
`;

/** Redis-backed implementation of {@link RateLimitStore}. */
export const rateLimitStore: RateLimitStore = {
  available: redis !== null,

  async increment(key: string, windowStart: number, ttlMs: number): Promise<number> {
    if (!redis) throw new Error("redis_unavailable");
    // Window-scoped key (Redis expires it at window end → no cleanup).
    const redisKey = `${REDIS_PREFIX}rl:${key}:${windowStart}`;
    return Number(
      await redis.eval(INCR_WINDOW, 1, redisKey, String(ttlMs)),
    );
  },
};
