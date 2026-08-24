/**
 * Composition root for the rate-limit store: binds the middleware to the
 * Redis-backed store. The rate-limit middleware imports the wired store here.
 */
import { rateLimitStore } from "../adapters/driven/rateLimitStore";

export { rateLimitStore };
