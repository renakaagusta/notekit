// Wires up the MCP server: registers every tool + resource, then connects
// the caller-provided transport. Keeping this isolated from `index.ts` makes
// it trivial to instantiate the server for tests or embed it in another
// process without going through `process.argv` / `process.env`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { makeClient, type NoteKitMcpConfig } from "./lib/notekit.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerSecretTools } from "./tools/secrets.js";
import { registerTicketTools } from "./tools/tickets.js";
import { registerVaultTools } from "./tools/vault.js";
import { registerNoteResource } from "./resources/note.js";
import { registerTicketResource } from "./resources/ticket.js";

export interface CreateServerOptions extends NoteKitMcpConfig {
  /** Override server name/version (e.g. for tests). */
  name?: string;
  version?: string;
}

export function createMcpServer(opts: CreateServerOptions): McpServer {
  const nk = makeClient(opts);

  const server = new McpServer(
    {
      name: opts.name ?? "notekit-mcp",
      version: opts.version ?? "0.1.0",
    },
    {
      instructions: [
        "You are talking to a user's NoteKit vault — a Git-backed Markdown notes and tickets system.",
        "Notes live under `notes/`; tickets live under `tickets/`. Both are Markdown with YAML frontmatter.",
        "Prefer `notes_search` / `tickets_list` before reading or writing, so you don't clobber existing files.",
        "Every write is a Git commit — keep commit messages concise and present-tense.",
      ].join(" "),
    },
  );

  registerVaultTools(server, nk);
  registerSecretTools(server, nk);
  registerNoteTools(server, nk);
  registerTicketTools(server, nk);
  registerNoteResource(server, nk);
  registerTicketResource(server, nk);

  return server;
}

export async function connectServer(
  server: McpServer,
  transport: Transport,
): Promise<void> {
  await server.connect(transport);
}
