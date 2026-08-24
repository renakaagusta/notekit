import "./lib/telemetry"; // must be first — initializes OTel SDK before any other import
import { serve } from "@hono/node-server";
import { trace, context, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { pool } from "./adapters/driven/db";
import { revokeVaultToken, vaultConfigured } from "./adapters/driven/hcvault";
import { agentRoutes } from "./adapters/driving/routes/agents";
import { authRoutes } from "./adapters/driving/routes/auth";
import { avatarRoutes } from "./adapters/driving/routes/avatar";
import { directoryRoutes } from "./adapters/driving/routes/directory";
import { iapRoutes } from "./adapters/driving/routes/iap";
import { integrationsRoutes } from "./adapters/driving/routes/integrations";
import { notificationRoutes } from "./adapters/driving/routes/notifications";
import { vaultRoutes } from "./adapters/driving/routes/vault";
import { backofficeRoutes } from "./backoffice/routes";
import { startTelegramPoller } from "./composition/notifications";
import { env } from "./env";
import { logger } from "./lib/logger";

const app = new Hono();

// Defense in depth: minimum set of hardening headers. No CSP here because
// the API serves JSON only — the web app handles its own CSP.
app.use("*", secureHeaders({
  crossOriginResourcePolicy: "same-site",
  referrerPolicy: "no-referrer",
}));

// Manual HTTP server spans — OTel instrumentation-http doesn't patch ESM
// servers. We create the span here, set it as the active context, then all
// downstream work (pg queries, outbound fetches) becomes a child span.
const tracer = trace.getTracer("notekit-api");
app.use("*", async (c, next) => {
  const start = Date.now();
  const span = tracer.startSpan(`${c.req.method} ${c.req.path}`, {
    kind: SpanKind.SERVER,
    attributes: {
      "http.method": c.req.method,
      "http.url": c.req.url,
      "http.route": c.req.path,
      "server.address": c.req.header("host") ?? "",
    },
  });
  await context.with(trace.setSpan(context.active(), span), async () => {
    await next();
    const status = c.res.status;
    span.setAttribute("http.status_code", status);
    if (status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    // Log BEFORE span.end() so isRecording()=true and trace_id injects into the log.
    logger.info({ method: c.req.method, path: c.req.path, status, ms: Date.now() - start }, "request");
    span.end();
  });
});

// `webUrl` is the primary web origin; `extraCorsOrigins` lets ops add
// Capacitor (`capacitor://localhost`, `https://localhost`) and E2E origins
// without recompiling. The list is small and exact-match; we never reflect
// arbitrary `Origin` headers.
const allowedOrigins = [env.webUrl, env.backoffice.webUrl, ...env.extraCorsOrigins];
app.use(
  "*",
  cors({
    origin: allowedOrigins,
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
  logger.error({ method: c.req.method, path: c.req.path, err }, "unhandled error");
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
app.route("/directory", directoryRoutes);
// Superadmin backoffice: better-auth (/backoffice/auth/*) + admin-gated data
// endpoints (/backoffice/me, /overview, /users, /billing, /vaults).
app.route("/backoffice", backofficeRoutes);
// Public Gravatar-compatible service. Mounted last so its CORS-permissive
// nature (images served to other origins) is intentional and traceable.
app.route("/avatar", avatarRoutes);

const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    logger.info({ port: info.port }, "api listening");
  },
);

// Long-poll Telegram for bot replies in dev. In prod, set a webhook instead.
startTelegramPoller();

// Graceful shutdown — drain in-flight requests, revoke Vault token, then close the PG pool.
function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    const vaultRevoke = vaultConfigured() ? revokeVaultToken() : Promise.resolve();
    vaultRevoke.finally(() => pool.end().finally(() => process.exit(0)));
  });
  setTimeout(() => {
    logger.warn("forced exit after 10s");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
