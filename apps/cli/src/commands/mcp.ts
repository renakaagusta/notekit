// `notekit mcp <sub>` — convenience wrapper for the MCP server that lives in
// `apps/mcp`. Spawning it from here means a user with the CLI installed
// doesn't have to discover a second binary; `notekit mcp serve` just works.

import { defineCommand } from "citty";
import kleur from "kleur";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { getToken } from "../keychain.js";

const serveCmd = defineCommand({
  meta: {
    name: "serve",
    description: "Start the NoteKit MCP server on stdio (for Claude Desktop, Cursor, etc.).",
  },
  args: {
    sse: {
      type: "boolean",
      description: "Serve over SSE on --port instead of stdio.",
      required: false,
    },
    port: {
      type: "string",
      description: "Port to bind for --sse (default 4111).",
      required: false,
    },
  },
  async run({ args }) {
    const candidate = resolveLocalMcpEntry();
    if (!candidate) {
      process.stderr.write(
        kleur.yellow(
          "Could not find the @notekit/mcp server bundle.\n" +
            "Build it once with: pnpm --filter @notekit/mcp build\n",
        ),
      );
      process.exitCode = 1;
      return;
    }

    const cfg = await loadConfig();
    const token = await getToken();
    if (!token) {
      process.stderr.write(
        kleur.red("Not signed in. Run `notekit auth login` first.\n"),
      );
      process.exitCode = 1;
      return;
    }

    // The MCP server reads these on boot. stdio mode is the default; --sse
    // and --port get forwarded as-is for users who want a remote endpoint.
    const env = {
      ...process.env,
      NOTEKIT_API_URL: cfg.apiUrl,
      NOTEKIT_TOKEN: token,
    };

    const childArgs: string[] = [candidate];
    if (args.sse) {
      childArgs.push("--sse");
      childArgs.push("--port", String(args.port ?? "4111"));
    }

    const child = spawn(process.execPath, childArgs, { stdio: "inherit", env });
    child.on("close", (code, signal) => {
      if (code !== null) {
        process.exit(code);
        return;
      }
      // Null code + a signal means the child was killed (SIGSEGV, SIGTERM,
      // …). Treat as failure so a CI script driving `notekit mcp serve` can
      // notice the crash rather than mistaking it for a clean shutdown.
      if (signal) {
        process.stderr.write(`MCP server exited on signal ${signal}\n`);
      }
      process.exit(1);
    });
  },
});

export const mcpCommand = defineCommand({
  meta: { name: "mcp", description: "Run the NoteKit MCP server." },
  subCommands: { serve: serveCmd },
});

function resolveLocalMcpEntry(): string | null {
  // Where the bundled MCP entrypoint might live, in priority order:
  //   1. NOTEKIT_MCP_BIN env var (escape hatch for unusual layouts)
  //   2. Monorepo: apps/cli/dist/index.js → ../../../mcp/dist/index.js
  //   3. Monorepo source dev: apps/cli/src/commands/mcp.ts → ../../../../mcp/dist/index.js
  //   4. npm-style sibling: node_modules/@notekit/mcp/dist/index.js next to @notekit/cli
  try {
    const override = process.env.NOTEKIT_MCP_BIN;
    if (override && existsSync(override)) return override;

    const here = fileURLToPath(import.meta.url);
    const candidates = [
      path.resolve(here, "../../../mcp/dist/index.js"),
      path.resolve(here, "../../../../mcp/dist/index.js"),
      path.resolve(here, "../../../../@notekit/mcp/dist/index.js"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  } catch {
    // ignore
  }
  return null;
}
