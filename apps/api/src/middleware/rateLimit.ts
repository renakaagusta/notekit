/**
 * Per-principal fixed-window rate limiter, backed by the shared Redis instance.
 * Counters are persistent (survive API restarts) and correct across processes —
 * nothing lives in this process's memory. Buckets are keyed by user id (or agent
 * token) + route bucket name, so different routes don't drain each other's
 * budgets. Keys carry the `notekit:` prefix + a TTL, so Redis expires them for
 * us (no cleanup) and the shared instance stays collision-free.
 */
import type { Context, MiddlewareHandler } from "hono";
import { redis, REDIS_PREFIX } from "../lib/redis";
import { getCurrentUser } from "../auth/sessions";
import { getActingAgent } from "../auth/agentAuth";
import { logger } from "../lib/logger";

export interface RateLimitOptions {
  /** Logical name for telemetry + isolation between routes. */
  bucket: string;
  /** Window size in milliseconds. */
  windowMs: number;
  /** Max requests per principal within the window. */
  max: number;
}

// Atomic INCR + set-expiry-on-first-hit for the current window, in one call.
const INCR_WINDOW = `
  local c = redis.call('INCR', KEYS[1])
  if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
  return c
`;

async function check(key: string, windowMs: number, max: number): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
}> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  if (!redis) {
    // No Redis configured (e.g. local dev) — don't block; just allow.
    return { allowed: true, remaining: max, resetAt };
  }
  try {
    // Window-scoped key (Redis expires it at window end → no cleanup).
    const redisKey = `${REDIS_PREFIX}rl:${key}:${windowStart}`;
    const count = Number(
      await redis.eval(INCR_WINDOW, 1, redisKey, String(resetAt - now)),
    );
    return { allowed: count <= max, remaining: Math.max(0, max - count), resetAt };
  } catch (err) {
    // Fail open: a Redis blip shouldn't lock everyone out.
    logger.warn({ err, key }, "[ratelimit] redis check failed — allowing");
    return { allowed: true, remaining: max, resetAt };
  }
}

async function principalId(c: Context): Promise<string | null> {
  const agent = await getActingAgent(c);
  if (agent) return `agent:${agent.userId}:${agent.agentSlug}`;
  const user = await getCurrentUser(c);
  if (user) return `user:${user.id}`;
  return null;
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    const principal = await principalId(c);
    if (!principal) {
      // Unauthenticated traffic shouldn't get a per-principal allowance —
      // let the downstream auth check 401 it. We still budget per IP to
      // contain misbehaving clients during login flows.
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
      const r = await check(`ip:${ip}:${opts.bucket}`, opts.windowMs, opts.max);
      if (!r.allowed) return rateLimitedResponse(c, opts, r);
      await next();
      return;
    }
    const key = `${principal}:${opts.bucket}`;
    const r = await check(key, opts.windowMs, opts.max);
    if (!r.allowed) return rateLimitedResponse(c, opts, r);
    c.header("X-RateLimit-Limit", String(opts.max));
    c.header("X-RateLimit-Remaining", String(r.remaining));
    c.header("X-RateLimit-Reset", String(Math.floor(r.resetAt / 1000)));
    await next();
  };
}

function rateLimitedResponse(
  c: Context,
  opts: RateLimitOptions,
  state: { resetAt: number },
) {
  const retryAfter = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000));
  c.header("Retry-After", String(retryAfter));
  c.header("X-RateLimit-Limit", String(opts.max));
  c.header("X-RateLimit-Remaining", "0");
  c.header("X-RateLimit-Reset", String(Math.floor(state.resetAt / 1000)));
  return c.json({ error: "rate_limited", retryAfter }, 429);
}
