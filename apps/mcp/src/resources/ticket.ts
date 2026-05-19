// `ticket://` resource scheme — same model as `note://` but for tickets.
//   ticket://<vaultId>/<urlEncodedPath>

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { listVaultFiles } from "../lib/notekit.js";

const TICKETS_PREFIX = "tickets/";

export function registerTicketResource(server: McpServer, nk: NoteKitApi): void {
  server.registerResource(
    "ticket",
    new ResourceTemplate("ticket://{vaultId}/{+path}", {
      list: async () => {
        const status = await nk.vault.status();
        const vault = status.vault;
        if (!vault) return { resources: [] };
        const vaultId = vault.id ?? `${vault.owner}-${vault.repo}`;
        const entries = await listVaultFiles(nk, TICKETS_PREFIX);
        return {
          resources: entries
            .filter((e) => e.path.endsWith(".md"))
            .map((e) => ({
              uri: `ticket://${vaultId}/${encodePath(e.path)}`,
              name: e.path,
              mimeType: "text/markdown",
            })),
        };
      },
    }),
    {
      title: "NoteKit ticket",
      description: "A Markdown ticket stored in a NoteKit vault.",
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
  return p.split("/").map(encodeURIComponent).join("/");
}
