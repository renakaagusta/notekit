/**
 * Composition root for the rate-limit middleware: binds it to the Redis-backed
 * store. Routes import the wired `rateLimit` / `tryConsume` from here.
 */
import { rateLimitStore } from "../adapters/driven/rateLimitStore";
import { createRateLimit } from "../adapters/driving/middleware/rateLimit";

const limiter = createRateLimit(rateLimitStore);

export const rateLimit = limiter.rateLimit;
export const tryConsume = limiter.tryConsume;
