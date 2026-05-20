// SSE transport — for clients that connect over the network (browser-based
// MCP playgrounds, remote agents, etc.). We use the legacy `SSEServerTransport`
// from the SDK because it's the most widely supported by current clients;
// once Streamable HTTP is the universal default we can migrate.
//
// We mount two routes on a plain Node http server (no Hono dep just for two
// endpoints):
//   GET  /sse        — opens the SSE stream
//   POST /messages   — client → server JSON-RPC messages
//
// Session routing uses the `sessionId` query param the SDK assigns when the
// SSE connection is established.
//
// Security model — the SSE process holds a NoteKit PAT in its env and will
// happily invoke every registered tool against the user's vault. Anyone who
// can reach this port is *the user*. We therefore:
//
//   1. Bind to 127.0.0.1 by default. The opt-out (`NOTEKIT_MCP_SSE_HOST`)
//      exists for users who deliberately tunnel through tailscale / ssh.
//   2. Require an `Authorization: Bearer <secret>` header on both endpoints,
//      where `<secret>` is either the same NOTEKIT_TOKEN already in env or
//      a dedicated NOTEKIT_MCP_SSE_SECRET if the user wants to issue a
//      separate, narrower credential. Without this, a malicious local web
//      page can use DNS rebinding to issue same-origin POSTs at this server.
//   3. Reject any Host header whose hostname isn't loopback so a rebound
//      origin can't trick us even if the port happens to be exposed.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MESSAGES_PATH = "/messages";

export interface SseOptions {
  port: number;
  /** Default 127.0.0.1; opt out via env for tunneled / remote setups. */
  host?: string;
  /** Bearer secret required on both endpoints. */
  secret: string;
}

export async function runSse(server: McpServer, opts: SseOptions): Promise<void> {
  const transports = new Map<string, SSEServerTransport>();
  const host = opts.host ?? "127.0.0.1";
  const secretBuf = Buffer.from(opts.secret, "utf8");

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (!hostHeaderIsLoopback(req.headers.host)) {
        res.statusCode = 403;
        res.end("forbidden host");
        return;
      }
      if (!checkBearer(req, secretBuf)) {
        res.statusCode = 401;
        res.setHeader("WWW-Authenticate", 'Bearer realm="notekit-mcp"');
        res.end("unauthorized");
        return;
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && url.pathname === "/sse") {
        const transport = new SSEServerTransport(MESSAGES_PATH, res);
        transports.set(transport.sessionId, transport);
        res.on("close", () => transports.delete(transport.sessionId));
        await server.connect(transport);
        return;
      }

      if (req.method === "POST" && url.pathname === MESSAGES_PATH) {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          res.statusCode = 400;
          res.end("missing sessionId");
          return;
        }
        const transport = transports.get(sessionId);
        if (!transport) {
          res.statusCode = 404;
          res.end("unknown sessionId");
          return;
        }
        await transport.handlePostMessage(req, res);
        return;
      }

      if (req.method === "GET" && url.pathname === "/healthz") {
        res.statusCode = 200;
        res.end("ok");
        return;
      }

      res.statusCode = 404;
      res.end("not found");
    } catch (err) {
      // Don't leak stack traces to remote callers — log them locally.
      process.stderr.write(`[notekit-mcp] sse error: ${(err as Error).message}\n`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("internal error");
      }
    }
  });

  await new Promise<void>((resolve) => http.listen(opts.port, host, resolve));
  process.stderr.write(
    `[notekit-mcp] sse transport listening on http://${host}:${opts.port} (bearer required)\n`,
  );

  const shutdown = async () => {
    http.close();
    await Promise.allSettled([...transports.values()].map((t) => t.close()));
    transports.clear();
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Constant-time compare against the configured bearer secret. Length-mismatch
 * is returned as a non-equal result without leaking timing.
 */
function checkBearer(req: IncomingMessage, expected: Buffer): boolean {
  const header = req.headers["authorization"];
  if (!header || Array.isArray(header)) return false;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const presented = Buffer.from(match[1]!.trim(), "utf8");
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

/**
 * Block DNS-rebinding: only honor requests whose Host header resolves to a
 * loopback literal. An attacker on the local network can route a victim's
 * browser to this port via a malicious DNS response, but they cannot forge
 * a loopback Host header from a non-loopback origin.
 */
function hostHeaderIsLoopback(rawHost: string | undefined): boolean {
  if (!rawHost) return false;
  // Strip port + IPv6 brackets.
  const hostnameOnly = rawHost.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return (
    hostnameOnly === "127.0.0.1" ||
    hostnameOnly === "localhost" ||
    hostnameOnly === "::1"
  );
}
