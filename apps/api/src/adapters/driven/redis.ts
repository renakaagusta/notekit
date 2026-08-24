import Redis from "ioredis";
import { env } from "../../env";
import { logger } from "../../lib/logger";

/**
 * Shared Redis client. The host's Redis instance is shared across projects, so
 * every key this app writes is namespaced with {@link REDIS_PREFIX} to stay
 * collision-free. `null` when REDIS_URL is unset (e.g. local dev without Redis)
 * — callers must handle that (the rate limiter fails open).
 */
export const REDIS_PREFIX = "notekit:";

export const redis: Redis | null = env.redisUrl
  ? new Redis(env.redisUrl, {
      // Fail fast rather than queueing while disconnected, so a Redis blip makes
      // dependent code (e.g. the rate limiter) degrade instead of hang.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    })
  : null;

if (redis) {
  redis.on("error", (err) => logger.warn({ err }, "[redis] connection error"));
} else if (env.isProd) {
  // Loud, but non-fatal: booting without Redis in prod means the rate limiter
  // degrades to fail-open. Better to surface it than to silently stop limiting.
  logger.warn("[redis] REDIS_URL is unset in production — rate limiting is DISABLED (fail-open)");
}
