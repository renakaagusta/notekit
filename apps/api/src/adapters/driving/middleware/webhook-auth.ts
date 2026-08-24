/**
 * Centralized webhook signature / secret verification.
 *
 * Usage:
 *   route.post("/google/webhook", requireWebhookSecret("GOOGLE_PLAY_PUBSUB_SECRET", { scheme: "bearer" }), handler)
 *   route.post("/telegram/webhook", requireWebhookSecret("TELEGRAM_WEBHOOK_SECRET", { scheme: "telegram" }), handler)
 *   route.post("/apple/webhook", requireWebhookSecret("APPLE_WEBHOOK_SECRET"), handler)
 *
 * Schemes:
 *   "bearer"   — Authorization: Bearer <secret>  (Google Pub/Sub, Apple custom)
 *   "telegram" — X-Telegram-Bot-Api-Secret-Token header OR ?secret=... query param
 *   (default)  — ?secret=<secret> query param only
 */
import type { Context, Next, MiddlewareHandler } from "hono";

export interface WebhookAuthOptions {
  /**
   * Name of the HTTP header to read the secret from (bearer scheme only).
   * Defaults to "Authorization".
   */
  headerName?: string;
  /**
   * "bearer"   — Authorization: Bearer <secret>
   * "telegram" — X-Telegram-Bot-Api-Secret-Token header OR ?secret query param
   * unset      — ?secret query param only
   */
  scheme?: "bearer" | "telegram";
}

export function requireWebhookSecret(
  secretEnvKey: string,
  opts: WebhookAuthOptions = {},
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const secret = process.env[secretEnvKey] ?? null;

    if (!secret) {
      return c.json({ error: "webhook_not_configured" }, 503);
    }

    const { scheme, headerName = "Authorization" } = opts;

    if (scheme === "bearer") {
      const authHeader = c.req.header(headerName) ?? "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (token !== secret) {
        return c.json({ error: "forbidden" }, 403);
      }
    } else if (scheme === "telegram") {
      const headerToken = c.req.header("x-telegram-bot-api-secret-token");
      const queryToken = c.req.query("secret");
      if (headerToken !== secret && queryToken !== secret) {
        return c.json({ error: "forbidden" }, 403);
      }
    } else {
      // Default: query param ?secret=<value>
      const queryToken = c.req.query("secret");
      if (queryToken !== secret) {
        return c.json({ error: "forbidden" }, 403);
      }
    }

    await next();
  };
}
