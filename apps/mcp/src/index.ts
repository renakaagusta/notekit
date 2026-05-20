// @notekit/mcp — Model Context Protocol server for NoteKit.
//
// AGPL-3.0-only. Self-hosting and modification are allowed; redistributing
// modified versions requires sharing the source under AGPL. See the project
// README for details.
//
// Usage:
//   notekit-mcp                        # stdio transport (default; Claude Desktop)
//   notekit-mcp --sse --port 3030      # SSE transport on 127.0.0.1:3030
//
// Env:
//   NOTEKIT_API_URL          default http://localhost:3001
//   NOTEKIT_TOKEN            required — bearer token minted from the NoteKit web UI
//   NOTEKIT_MCP_SSE_HOST     SSE bind host (default 127.0.0.1; opt out for tunnels)
//   NOTEKIT_MCP_SSE_SECRET   SSE Authorization bearer (default: same as NOTEKIT_TOKEN)

import { createMcpServer } from "./server.js";
import { runStdio } from "./transports/stdio.js";
import { runSse } from "./transports/sse.js";

interface Cli {
  transport: "stdio" | "sse";
  port: number;
}

function parseArgv(argv: string[]): Cli {
  const cli: Cli = { transport: "stdio", port: 3030 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--sse":
        cli.transport = "sse";
        break;
      case "--stdio":
        cli.transport = "stdio";
        break;
      case "--port": {
        const next = argv[i + 1];
        if (!next) throw new Error("--port requires a value");
        const n = Number(next);
        if (!Number.isInteger(n) || n <= 0 || n > 65535) {
          throw new Error(`invalid --port value: ${next}`);
        }
        cli.port = n;
        i++;
        break;
      }
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return cli;
}

function printHelp(): void {
  process.stdout.write(
    [
      "notekit-mcp — Model Context Protocol server for NoteKit",
      "",
      "Usage:",
      "  notekit-mcp                       Start with stdio transport (Claude Desktop)",
      "  notekit-mcp --sse --port <port>   Start with SSE transport over HTTP",
      "",
      "Env:",
      "  NOTEKIT_API_URL  NoteKit API base URL (default http://localhost:3001)",
      "  NOTEKIT_TOKEN    Bearer token (required)",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const cli = parseArgv(process.argv.slice(2));

  const baseUrl = process.env["NOTEKIT_API_URL"] ?? "http://localhost:3001";
  const token = process.env["NOTEKIT_TOKEN"];

  if (!token) {
    process.stderr.write(
      [
        "[notekit-mcp] ERROR: NOTEKIT_TOKEN env var is required.",
        "  Generate a token from the NoteKit web app (Settings → Tokens),",
        "  then re-run with NOTEKIT_TOKEN=... notekit-mcp",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  const server = createMcpServer({ baseUrl, token });

  if (cli.transport === "stdio") {
    await runStdio(server);
  } else {
    // SSE binds to 127.0.0.1 by default; users who genuinely want remote
    // access (over a Tailscale tunnel, an SSH forward, …) can set
    // NOTEKIT_MCP_SSE_HOST=0.0.0.0 and accept the threat model.
    const host = process.env["NOTEKIT_MCP_SSE_HOST"]?.trim() || undefined;
    // Reuse the NoteKit PAT as the SSE bearer unless the user supplies a
    // dedicated secret (recommended when sharing with another machine —
    // narrows the blast radius if the SSE bearer leaks).
    const secret = process.env["NOTEKIT_MCP_SSE_SECRET"]?.trim() || token;
    await runSse(server, { port: cli.port, host, secret });
  }
}

main().catch((err) => {
  process.stderr.write(`[notekit-mcp] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
