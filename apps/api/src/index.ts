import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { env } from "./env";
import { authRoutes } from "./routes/auth";
import { vaultRoutes } from "./routes/vault";
import { agentRoutes } from "./routes/agents";
import { notificationRoutes } from "./routes/notifications";
import { integrationsRoutes } from "./routes/integrations";
import { iapRoutes } from "./routes/iap";
import { avatarRoutes } from "./routes/avatar";
import { startTelegramPoller } from "./notifications/telegramPoller";

const app = new Hono();

// Defense in depth: minimum set of hardening headers. No CSP here because
// the API serves JSON only — the web app handles its own CSP.
app.use("*", secureHeaders({
  crossOriginResourcePolicy: "same-site",
  referrerPolicy: "no-referrer",
}));

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: [env.webUrl],
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// 2 MiB request bodies cover everything we accept today (notes, agent
// profiles, settings). Larger payloads almost certainly mean a bug or abuse.
app.use(
  "*",
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => c.json({ error: "payload_too_large" }, 413),
  }),
);

app.onError((err, c) => {
  console.error(`[api] unhandled error on ${c.req.method} ${c.req.path}:`, err);
  return c.json({ error: "server_error" }, 500);
});

app.get("/", (c) =>
  c.json({
    name: "@notekit/api",
    version: "0.1.0",
    status: "ok",
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", authRoutes);
app.route("/vault", vaultRoutes);
app.route("/agents", agentRoutes);
app.route("/notifications", notificationRoutes);
app.route("/integrations", integrationsRoutes);
app.route("/iap", iapRoutes);
// Public Gravatar-compatible service. Mounted last so its CORS-permissive
// nature (images served to other origins) is intentional and traceable.
app.route("/avatar", avatarRoutes);

const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
  },
);

// Long-poll Telegram for bot replies in dev. In prod, set a webhook instead.
startTelegramPoller();

// Graceful shutdown so in-flight requests finish and SQLite WAL flushes.
function shutdown(signal: NodeJS.Signals) {
  console.log(`[api] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => {
    console.warn("[api] forced exit after 10s");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
