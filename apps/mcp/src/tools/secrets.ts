// Secrets tools — list secret names + manage the vaults (groups) they live
// in. Secret VALUES are never exposed through MCP: revealing them needs the
// device's age private key, which only the desktop/web/mobile clients hold.
// Agents can therefore *organize* secrets but never read them.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import {
  configureSecretsBackend,
  secretsBackendFromApi,
  listSecretVaults,
  createSecretVault,
  renameSecretVault,
  deleteSecretVault,
  listAllSecrets,
  removeSecret,
  DEFAULT_VAULT_SLUG,
  DEFAULT_VAULT_LABEL,
} from "@notekit/core/secrets";
import { errorContent, jsonContent, textContent } from "../lib/notekit.js";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export function registerSecretTools(server: McpServer, nk: NoteKitApi): void {
  // Wire the secrets module to use this MCP session's bearer-auth client.
  configureSecretsBackend(secretsBackendFromApi(nk));

  server.registerTool(
    "secret_vault_list",
    {
      title: "List secret vaults",
      description:
        "List every secret vault (group) and the number of secrets each contains. The 'default' vault is the root bucket where ungrouped secrets live and is always present, even when empty.",
      inputSchema: {},
    },
    async () => {
      try {
        const [vaults, secrets] = await Promise.all([listSecretVaults(), listAllSecrets()]);
        const defaultCount = secrets.filter((s) => s.vault === DEFAULT_VAULT_SLUG).length;
        return jsonContent({
          vaults: [
            { slug: DEFAULT_VAULT_SLUG, label: DEFAULT_VAULT_LABEL, builtIn: true, secretCount: defaultCount },
            ...vaults.map((v) => ({
              slug: v.slug,
              label: v.label,
              createdAt: v.createdAt,
              secretCount: secrets.filter((s) => s.vault === v.slug).length,
            })),
          ],
        });
      } catch (err) {
        return errorContent(`secret_vault_list failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "secret_vault_create",
    {
      title: "Create a secret vault",
      description:
        "Create a new vault to group related secrets under. Slug is auto-derived from the label (lowercase, hyphenated) unless overridden.",
      inputSchema: {
        label: z.string().min(1).max(80).describe("Human-readable name, e.g. 'Work'."),
        slug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,39}$/)
          .optional()
          .describe("Override the auto-generated slug. Lowercase alphanumeric + hyphens, 1–40 chars."),
      },
    },
    async ({ label, slug }) => {
      try {
        const finalSlug = slug ?? slugify(label);
        if (!finalSlug) {
          return errorContent("Label must contain at least one letter or digit, or pass an explicit slug.");
        }
        const record = await createSecretVault(finalSlug, label);
        return jsonContent({ vault: record });
      } catch (err) {
        return errorContent(`secret_vault_create failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "secret_vault_rename",
    {
      title: "Rename a secret vault",
      description: "Change the display label of a vault. The slug (folder name) is preserved.",
      inputSchema: {
        slug: z.string().min(1).describe("Slug of the vault to rename."),
        label: z.string().min(1).max(80).describe("New display label."),
      },
    },
    async ({ slug, label }) => {
      try {
        const record = await renameSecretVault(slug, label);
        return jsonContent({ vault: record });
      } catch (err) {
        return errorContent(`secret_vault_rename failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "secret_vault_delete",
    {
      title: "Delete a secret vault",
      description:
        "Delete a vault. Refuses to delete a non-empty vault unless `force` is true. The 'default' vault cannot be deleted.",
      inputSchema: {
        slug: z.string().min(1).describe("Slug of the vault to delete."),
        force: z
          .boolean()
          .optional()
          .describe("Also remove every secret inside the vault. Destructive — confirm with the user first."),
      },
    },
    async ({ slug, force }) => {
      try {
        if (slug === DEFAULT_VAULT_SLUG) {
          return errorContent("The default vault cannot be deleted.");
        }
        await deleteSecretVault(slug, { force: force ?? false });
        return textContent(`Deleted vault "${slug}"`);
      } catch (err) {
        return errorContent(`secret_vault_delete failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "secret_list",
    {
      title: "List secret names",
      description:
        "List the NAMES of every secret (never the values). Pass `vault` to restrict to one bucket; omit to list across every vault. Use this to discover what secrets exist before suggesting edits.",
      inputSchema: {
        vault: z
          .string()
          .optional()
          .describe("Restrict to one vault slug. Use 'default' for the root bucket. Omit for all."),
      },
    },
    async ({ vault }) => {
      try {
        const filter = normalizeVaultArg(vault);
        const secrets = await listAllSecrets();
        const filtered = filter === undefined ? secrets : secrets.filter((s) => s.vault === filter);
        return jsonContent({
          secrets: filtered.map((s) => ({
            name: s.name,
            vault: s.vault || DEFAULT_VAULT_SLUG,
            vaultLabel: s.vault || DEFAULT_VAULT_LABEL,
          })),
        });
      } catch (err) {
        return errorContent(`secret_list failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "secret_remove",
    {
      title: "Delete a secret",
      description:
        "Permanently remove a secret. Cannot be undone (a deletion commit lands in git history). Confirm with the user before calling.",
      inputSchema: {
        name: z.string().min(1).describe("Secret name."),
        vault: z
          .string()
          .optional()
          .describe("Vault slug ('default' or omitted = root bucket)."),
      },
    },
    async ({ name, vault }) => {
      try {
        const target = normalizeVaultArg(vault) ?? DEFAULT_VAULT_SLUG;
        // removeSecret's DeviceIdentity arg is only used to satisfy the signature
        // (the file is deleted, not re-encrypted), so a placeholder is safe here.
        await removeSecret(
          name,
          { deviceId: "mcp", name: "mcp", identity: "", recipient: "", createdAt: "" },
          target,
        );
        return textContent(`Removed secret "${name}" from "${target || DEFAULT_VAULT_LABEL}"`);
      } catch (err) {
        return errorContent(`secret_remove failed: ${(err as Error).message}`);
      }
    },
  );
}

/** Map "default" / "" / undefined to the empty-slug root vault; otherwise pass through. */
function normalizeVaultArg(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim();
  if (v === "" || v.toLowerCase() === "default") return DEFAULT_VAULT_SLUG;
  return v;
}
