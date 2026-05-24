// Reusable MCP server entrypoint. Lives separately from `index.ts` (which
// is the standalone-binary entry) so the unified `notekit` CLI binary
// can statically import it without dragging in argv parsing or the
// process.exit calls that only make sense for the standalone bundle.

import { createMcpServer } from "./server.js";
import { runStdio } from "./transports/stdio.js";
import { runSse } from "./transports/sse.js";

export interface RunMcpServerOptions {
  /** NoteKit API base URL — defaults to http://localhost:3001. */
  baseUrl?: string;
  /** Bearer token. Required. */
  token: string;
  /** Transport. Defaults to stdio (what every IDE uses). */
  transport?: "stdio" | "sse";
  /** SSE port (defaults to 4111). Ignored for stdio. */
  port?: number;
  /** SSE bind host. Defaults to 127.0.0.1. */
  sseHost?: string;
  /**
   * SSE Authorization bearer. Defaults to the same `token` — set a
   * dedicated secret when sharing the SSE endpoint across machines so a
   * leaked SSE bearer doesn't give up the full NoteKit PAT.
   */
  sseSecret?: string;
}

/**
 * Boot the MCP server and connect it to the requested transport.
 *
 * For stdio (the IDE-facing path) this returns a Promise that never
 * resolves under normal operation — the transport keeps the event loop
 * alive until the client disconnects.
 *
 * For SSE, the underlying http server registers SIGINT/SIGTERM handlers
 * so `await runMcpServer({ transport: "sse", … })` will return when the
 * process is asked to shut down.
 */
export async function runMcpServer(opts: RunMcpServerOptions): Promise<void> {
  const baseUrl = opts.baseUrl ?? "http://localhost:3001";
  const server = createMcpServer({ baseUrl, token: opts.token });
  if ((opts.transport ?? "stdio") === "stdio") {
    await runStdio(server);
    return;
  }
  const host = opts.sseHost?.trim() || undefined;
  const secret = opts.sseSecret?.trim() || opts.token;
  await runSse(server, {
    port: opts.port ?? 4111,
    host,
    secret,
  });
}
