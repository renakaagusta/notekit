// `notekit mcp <sub>` — convenience wrapper for the MCP server that lives in
// `apps/mcp` (not yet built). When that app ships we'll spawn it here so users
// don't need a separate install path.

import { defineCommand } from "citty";
import kleur from "kleur";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serveCmd = defineCommand({
  meta: { name: "serve", description: "Start the NoteKit MCP server on stdio." },
  async run() {
    // Phase 3 TODO: `apps/mcp` does not exist yet — when it does, this should
    // resolve via the monorepo path in dev and via `require.resolve` in a
    // published install.
    const candidate = resolveLocalMcpEntry();
    if (!candidate) {
      process.stderr.write(
        kleur.yellow(
          "MCP server is not installed. Once `apps/mcp` ships, this command will spawn it.\n" +
            "For now, run the MCP server directly from your editor's MCP config.\n",
        ),
      );
      process.exitCode = 1;
      return;
    }
    const child = spawn(process.execPath, [candidate], { stdio: "inherit" });
    child.on("close", (code) => {
      process.exit(code ?? 0);
    });
  },
});

export const mcpCommand = defineCommand({
  meta: { name: "mcp", description: "Run the NoteKit MCP server." },
  subCommands: { serve: serveCmd },
});

function resolveLocalMcpEntry(): string | null {
  // Walk up from this file to find a sibling `apps/mcp/dist/index.js`.
  try {
    const here = fileURLToPath(import.meta.url);
    // dist layout: apps/cli/dist/index.js -> ../../mcp/dist/index.js
    // dev layout : apps/cli/src/commands/mcp.ts -> ../../../mcp/dist/index.js
    const candidates = [
      path.resolve(here, "../../../mcp/dist/index.js"),
      path.resolve(here, "../../../../mcp/dist/index.js"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  } catch {
    // ignore
  }
  return null;
}
