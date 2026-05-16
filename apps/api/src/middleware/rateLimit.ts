/**
 * Per-principal sliding-window rate limiter. Buckets are keyed by user id
 * (or agent token) + route bucket name, so different routes don't drain
 * each other's budgets.
 *
 * In-memory only — fine for the single-instance dev/self-host shape we
 * ship today. Move to Redis when the server runs as more than one process.
 */
import type { Context, MiddlewareHandler } from "hono";
import { getCurrentUser } from "../auth/sessions";
import { getActingAgent } from "../auth/agentAuth";

export interface RateLimitOptions {
  /** Logical name for telemetry + isolation between routes. */
  bucket: string;
  /** Window size in milliseconds. */
  windowMs: number;
  /** Max requests per principal within the window. */
  max: number;
}

const buckets = new Map<string, number[]>();

function check(key: string, windowMs: number, max: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const cutoff = now - windowMs;
  const fresh = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (fresh.length >= max) {
    buckets.set(key, fresh);
    const oldest = fresh[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + windowMs,
    };
  }
  fresh.push(now);
  buckets.set(key, fresh);
  return {
    allowed: true,
    remaining: Math.max(0, max - fresh.length),
    resetAt: now + windowMs,
  };
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
      const r = check(`ip:${ip}:${opts.bucket}`, opts.windowMs, opts.max);
      if (!r.allowed) return rateLimitedResponse(c, opts, r);
      await next();
      return;
    }
    const key = `${principal}:${opts.bucket}`;
    const r = check(key, opts.windowMs, opts.max);
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
