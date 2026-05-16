import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { authRoutes } from "./routes/auth";
import { vaultRoutes } from "./routes/vault";
import { agentRoutes } from "./routes/agents";

const app = new Hono();

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

serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
  },
);
