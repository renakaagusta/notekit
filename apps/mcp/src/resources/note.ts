// `note://` resource scheme — exposes notes in the selected vault as MCP
// resources so clients can list and read them without invoking a tool. The
// URI shape is:
//
//   note://<vaultId>/<urlEncodedPath>
//
// For listing, we only enumerate notes in the *currently selected* vault.
// Cross-vault listing would require fanning out to every vault on every
// call; clients that want that should call `vault_list` first.

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { listVaultFiles } from "../lib/notekit.js";

const NOTES_PREFIX = "notes/";

export function registerNoteResource(server: McpServer, nk: NoteKitApi): void {
  server.registerResource(
    "note",
    new ResourceTemplate("note://{vaultId}/{+path}", {
      list: async () => {
        const status = await nk.vault.status();
        const vault = status.vault;
        if (!vault) return { resources: [] };
        const vaultId = vault.id ?? `${vault.owner}-${vault.repo}`;
        const entries = await listVaultFiles(nk, NOTES_PREFIX);
        return {
          resources: entries
            .filter((e) => e.path.endsWith(".md"))
            .map((e) => ({
              uri: `note://${vaultId}/${encodePath(e.path)}`,
              name: e.path,
              mimeType: "text/markdown",
            })),
        };
      },
    }),
    {
      title: "NoteKit note",
      description: "A Markdown note stored in a NoteKit vault.",
      mimeType: "text/markdown",
    },
    async (uri, vars) => {
      const rawPath = Array.isArray(vars?.path) ? vars.path.join("/") : vars?.path ?? "";
      const path = decodeURIComponent(String(rawPath));
      const file = await nk.vault.readFile(path);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/markdown",
            text: file.content ?? "",
          },
        ],
      };
    },
  );
}

function encodePath(p: string): string {
  // Encode each segment separately so `/` stays readable in the URI.
  return p.split("/").map(encodeURIComponent).join("/");
}
