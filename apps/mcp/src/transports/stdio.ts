// Stdio transport — what Claude Desktop / Cursor / Zed launch when they spawn
// the `notekit-mcp` binary. The SDK does all the actual JSON-RPC framing; we
// just wire up the McpServer to stdin/stdout and surface a shutdown hook.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr only — stdout is the JSON-RPC channel and any extra bytes
  // will desync the client.
  process.stderr.write("[notekit-mcp] stdio transport ready\n");

  const shutdown = async () => {
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
