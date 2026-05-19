// Vault-management tools — list available vaults and switch the active one.
// Almost every other tool implicitly operates against the "selected" vault,
// so giving the LLM a way to inspect and change that is essential.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { errorContent, jsonContent, textContent } from "../lib/notekit.js";

export function registerVaultTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "vault_list",
    {
      title: "List vaults",
      description:
        "List all vaults the user can access, marking which one is currently selected. Use this before notes_/tickets_ operations if the user mentions 'switch vault' or seems unsure which vault is active.",
      inputSchema: {},
    },
    async () => {
      try {
        const [list, status] = await Promise.all([nk.vault.listVaults(), nk.vault.status()]);
        return jsonContent({
          activeId: list.activeId,
          selected: status.vault,
          vaults: list.vaults,
        });
      } catch (err) {
        return errorContent(`vault_list failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "vault_select",
    {
      title: "Select vault",
      description:
        "Set the active vault for this user. All subsequent note/ticket operations will operate on this vault. Use when the user explicitly asks to switch vaults.",
      inputSchema: {
        vaultId: z.string().min(1).describe("Vault id from vault_list."),
      },
    },
    async ({ vaultId }) => {
      try {
        await nk.vault.selectVaultById(vaultId);
        return textContent(`Selected vault ${vaultId}`);
      } catch (err) {
        return errorContent(`vault_select failed: ${(err as Error).message}`);
      }
    },
  );
}
