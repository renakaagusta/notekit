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

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MESSAGES_PATH = "/messages";

export async function runSse(server: McpServer, port: number): Promise<void> {
  const transports = new Map<string, SSEServerTransport>();

  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
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

  await new Promise<void>((resolve) => http.listen(port, resolve));
  process.stderr.write(`[notekit-mcp] sse transport listening on :${port}\n`);

  const shutdown = async () => {
    http.close();
    for (const t of transports.values()) await t.close();
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
