// `notekit secret <sub>` — manage encrypted secrets and the vaults that
// group them. Secret VALUES (get/set/move) require the device's age private
// key, which currently lives in the browser's IndexedDB; until CLI device
// pairing ships, this command is limited to:
//   * vault CRUD (list/create/rename/delete)
//   * listing secret names
//   * deleting a secret file (delete only touches the blob, no decrypt needed)

import { defineCommand } from "citty";
import kleur from "kleur";
import {
  listSecretVaults,
  createSecretVault,
  renameSecretVault,
  deleteSecretVault,
  listAllSecrets,
  removeSecret,
  getSecret,
  setSecret,
  DEFAULT_VAULT_LABEL,
  DEFAULT_VAULT_SLUG,
} from "@notekit/core/secrets";
import { getSecretsClient } from "../lib/secrets.js";
import { vaultDevice } from "../lib/crypto.js";
import { dieWithError } from "../client.js";

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

// ── secret vault subcommands ─────────────────────────────────────────────────

const vaultListCmd = defineCommand({
  meta: { name: "list", description: "List secret vaults and their secret counts." },
  async run() {
    try {
      await getSecretsClient({ requireAuth: true });
      const [vaults, allSecrets] = await Promise.all([listSecretVaults(), listAllSecrets()]);
      const defaultCount = allSecrets.filter((s) => s.vault === DEFAULT_VAULT_SLUG).length;
      process.stdout.write(
        `${kleur.dim("(default)".padEnd(20))}  ${DEFAULT_VAULT_LABEL.padEnd(24)}  ${kleur.gray(`${defaultCount} secret(s)`)}\n`,
      );
      for (const v of vaults) {
        const count = allSecrets.filter((s) => s.vault === v.slug).length;
        process.stdout.write(
          `${kleur.cyan(v.slug.padEnd(20))}  ${v.label.padEnd(24)}  ${kleur.gray(`${count} secret(s)`)}\n`,
        );
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const vaultCreateCmd = defineCommand({
  meta: {
    name: "create",
    description: "Create a new secret vault. Slug is derived from the label unless --slug is given.",
  },
  args: {
    label: { type: "positional", description: "Display name for the vault.", required: true },
    slug: { type: "string", description: "Override the auto-derived slug.", required: false },
  },
  async run({ args }) {
    try {
      await getSecretsClient({ requireAuth: true });
      const label = String(args.label);
      const slug = args.slug ? String(args.slug) : slugify(label);
      if (!slug) {
        process.stderr.write(kleur.red("error: label must contain at least one letter or digit (or pass --slug)\n"));
        process.exit(1);
      }
      const record = await createSecretVault(slug, label);
      process.stdout.write(`${kleur.green("created")}  ${kleur.cyan(record.slug)}  ${record.label}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const vaultRenameCmd = defineCommand({
  meta: { name: "rename", description: "Rename a vault's display label. Slug stays the same." },
  args: {
    slug: { type: "positional", description: "Vault slug.", required: true },
    label: { type: "positional", description: "New display label.", required: true },
  },
  async run({ args }) {
    try {
      await getSecretsClient({ requireAuth: true });
      const record = await renameSecretVault(String(args.slug), String(args.label));
      process.stdout.write(`${kleur.green("renamed")}  ${kleur.cyan(record.slug)}  ${record.label}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const vaultDeleteCmd = defineCommand({
  meta: {
    name: "delete",
    description: "Delete a vault. Refuses to delete a non-empty vault unless --force is passed.",
  },
  args: {
    slug: { type: "positional", description: "Vault slug.", required: true },
    force: { type: "boolean", description: "Also remove any secrets inside the vault.", required: false },
  },
  async run({ args }) {
    try {
      await getSecretsClient({ requireAuth: true });
      await deleteSecretVault(String(args.slug), { force: Boolean(args.force) });
      process.stdout.write(`${kleur.green("deleted")}  ${kleur.cyan(String(args.slug))}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const vaultCmd = defineCommand({
  meta: { name: "vault", description: "Manage groups (vaults) that secrets belong to." },
  subCommands: {
    list: vaultListCmd,
    create: vaultCreateCmd,
    rename: vaultRenameCmd,
    delete: vaultDeleteCmd,
  },
});

// ── secret subcommands ───────────────────────────────────────────────────────

const listCmd = defineCommand({
  meta: { name: "list", description: "List secret names (values stay encrypted — use the app to reveal)." },
  args: {
    vault: {
      type: "string",
      description: "Filter to a single vault slug. Use 'default' for the root vault.",
      required: false,
    },
  },
  async run({ args }) {
    try {
      await getSecretsClient({ requireAuth: true });
      const filter = args.vault === undefined ? null : normalizeVaultArg(String(args.vault));
      const secrets = await listAllSecrets();
      const filtered = filter === null ? secrets : secrets.filter((s) => s.vault === filter);
      if (filtered.length === 0) {
        process.stdout.write(kleur.dim("(no secrets)\n"));
        return;
      }
      for (const s of filtered) {
        const vaultLabel = s.vault || DEFAULT_VAULT_LABEL.toLowerCase();
        process.stdout.write(`${kleur.cyan(vaultLabel.padEnd(20))}  ${s.name}\n`);
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const removeCmd = defineCommand({
  meta: {
    name: "remove",
    description: "Permanently delete a secret. Cannot be undone (file leaves a git history entry).",
  },
  args: {
    name: { type: "positional", description: "Secret name.", required: true },
    vault: {
      type: "string",
      description: "Vault slug ('default' or omitted = root vault).",
      required: false,
    },
  },
  async run({ args }) {
    try {
      await getSecretsClient({ requireAuth: true });
      const vault = args.vault ? normalizeVaultArg(String(args.vault)) : DEFAULT_VAULT_SLUG;
      // `removeSecret` only needs a DeviceIdentity for its signature; the body
      // doesn't actually use it (the file is deleted, not re-encrypted). Pass
      // a placeholder so we don't need the device key on the CLI.
      await removeSecret(String(args.name), { deviceId: "cli", name: "cli", identity: "", recipient: "", createdAt: "" }, vault);
      process.stdout.write(`${kleur.green("removed")}  ${kleur.cyan(vault || "(default)")}/${args.name}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const setCmd = defineCommand({
  meta: {
    name: "set",
    description: "Create or update an encrypted secret (requires `vault unlock`).",
  },
  args: {
    name: { type: "positional", description: "Secret name.", required: true },
    value: { type: "positional", description: "Secret value.", required: true },
    vault: { type: "string", description: "Vault slug ('default' = root).", required: false },
  },
  async run({ args }) {
    try {
      await getSecretsClient({ requireAuth: true });
      const vault = args.vault ? normalizeVaultArg(String(args.vault)) : DEFAULT_VAULT_SLUG;
      await setSecret(String(args.name), String(args.value), await vaultDevice(), vault);
      process.stdout.write(`${kleur.green("set")}  ${kleur.cyan(vault || "(default)")}/${args.name}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const revealCmd = defineCommand({
  meta: {
    name: "reveal",
    description: "Decrypt and print a secret's value (requires `vault unlock`).",
  },
  args: {
    name: { type: "positional", description: "Secret name.", required: true },
    vault: { type: "string", description: "Vault slug ('default' = root).", required: false },
  },
  async run({ args }) {
    try {
      await getSecretsClient({ requireAuth: true });
      const vault = args.vault ? normalizeVaultArg(String(args.vault)) : DEFAULT_VAULT_SLUG;
      const value = await getSecret(String(args.name), await vaultDevice(), vault);
      if (value === null) {
        dieWithError(new Error(`secret "${args.name}" not found in vault "${vault || "(default)"}"`));
      }
      process.stdout.write(`${value}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

/** Accept "default", "" or "(default)" as aliases for the root vault. */
function normalizeVaultArg(raw: string): string {
  const v = raw.trim();
  if (v === "" || v.toLowerCase() === "default" || v === "(default)") return DEFAULT_VAULT_SLUG;
  return v;
}

export const secretCommand = defineCommand({
  meta: {
    name: "secret",
    description:
      "Manage encrypted secrets and the vaults that group them. Unlock with `notekit vault unlock` to set/reveal.",
  },
  subCommands: {
    vault: vaultCmd,
    list: listCmd,
    set: setCmd,
    reveal: revealCmd,
    remove: removeCmd,
  },
});
