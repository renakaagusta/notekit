// Wires up the MCP server: registers every tool + resource, then connects
// the caller-provided transport. Keeping this isolated from `index.ts` makes
// it trivial to instantiate the server for tests or embed it in another
// process without going through `process.argv` / `process.env`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { makeClient, type NoteKitMcpConfig } from "./lib/notekit.js";
import { resolveProjectContext } from "./lib/project.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerInboxTools } from "./tools/inbox.js";
import { registerLinkTools } from "./tools/links.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerSecretTools } from "./tools/secrets.js";
import { registerTicketTools } from "./tools/tickets.js";
import { registerVaultTools } from "./tools/vault.js";
import { registerNoteResource } from "./resources/note.js";
import { registerTicketResource } from "./resources/ticket.js";
import { registerNoteKitPrompts } from "./prompts/notekit.js";

export interface CreateServerOptions extends NoteKitMcpConfig {
  /** Override server name/version (e.g. for tests). */
  name?: string;
  version?: string;
}

export function createMcpServer(opts: CreateServerOptions): McpServer {
  const nk = makeClient(opts);
  // Resolve once at boot so we can mention the active project in the
  // system instructions. Tools re-resolve per-call, so a marker that
  // appears later (e.g. after `project_create`) still takes effect.
  const ctx = resolveProjectContext();

  const projectLine = ctx
    ? `The active project is \`${ctx.project}\` (resolved from ${ctx.source ?? "NOTEKIT_PROJECT"}). By default, notes and tickets read from \`projects/${ctx.project}/\` first and fall back to top-level folders; writes go to the project's folder.`
    : "No project is currently active. Tools default to a global scope. Call `project_current` to inspect, then `project_create` if the user wants to onboard this repo (auto-derives the slug from `git remote get-url origin`).";

  const server = new McpServer(
    {
      name: opts.name ?? "notekit-mcp",
      version: opts.version ?? "0.4.0",
    },
    {
      instructions: [
        "You are talking to a user's NoteKit vault — a Git-backed Markdown notes and tickets system.",
        "One vault may host many projects, each living under `projects/<slug>/`. Top-level `notes/` and `tickets/` hold cross-project / personal items.",
        projectLine,
        "Every tool that reads or writes notes/tickets accepts a `scope` arg: `project` (default), `global`, or `all`. Read-everywhere, write-locally — searches see both the project folder and top-level, but new files go into the project's folder.",
        "Prefer `notes_search` / `tickets_list` before reading or writing, so you don't clobber existing files. Use `project_list` to discover what scopes exist.",
        "Every write is a Git commit — keep commit messages concise and present-tense.",
      ].join(" "),
    },
  );

  registerVaultTools(server, nk);
  registerProjectTools(server, nk);
  registerSecretTools(server, nk);
  registerNoteTools(server, nk);
  registerTicketTools(server, nk);
  registerInboxTools(server, nk);
  registerLinkTools(server, nk);
  registerDiscoveryTools(server, nk);
  registerNoteResource(server, nk);
  registerTicketResource(server, nk);
  registerNoteKitPrompts(server);

  return server;
}
