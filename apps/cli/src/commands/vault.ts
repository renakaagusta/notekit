// `notekit vault <sub>` — list vaults, switch active vault, view members,
// and (eventually) trigger a sync. The active vault is tracked server-side by
// the API; the CLI mirrors it in config.json so other commands can show it in
// prompts without an extra round-trip.

import { defineCommand } from "citty";
import kleur from "kleur";
import { getClient, dieWithError } from "../client.js";
import { patchConfig } from "../config.js";

const listCmd = defineCommand({
  meta: { name: "list", description: "List vaults the signed-in user can access." },
  async run() {
    try {
      const nk = await getClient({ requireAuth: true });
      const { activeId, vaults } = await nk.vault.listVaults();
      if (vaults.length === 0) {
        process.stdout.write(kleur.dim("(no vaults)\n"));
        return;
      }
      for (const v of vaults) {
        const marker = v.id === activeId ? kleur.green("*") : " ";
        const label = v.label ?? `${v.owner}/${v.repo}`;
        const id = v.id ?? `${v.owner}/${v.repo}`;
        process.stdout.write(
          `${marker} ${kleur.dim(id)}  ${label}  ${kleur.gray(`(${v.provider ?? "github"}, ${v.branch})`)}\n`,
        );
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const switchCmd = defineCommand({
  meta: { name: "switch", description: "Switch the active vault." },
  args: {
    vaultId: { type: "positional", description: "Vault id to select.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const id = String(args.vaultId);
      await nk.vault.selectVaultById(id);
      await patchConfig({ currentVaultId: id });
      process.stdout.write(`${kleur.green("switched")} -> ${id}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const syncCmd = defineCommand({
  meta: {
    name: "sync",
    description:
      "Verify the active vault is reachable and print the latest commit on the branch.",
  },
  async run() {
    try {
      const nk = await getClient({ requireAuth: true });
      // The server doesn't keep a local working copy — every read/write
      // round-trips to the remote — so this is currently a proof-of-life
      // sync (auth OK, branch HEAD readable). True offline pull/push will
      // land when desktop/CLI gain a local cache.
      const res = await nk.vault.sync();
      const label = res.vault.label ?? `${res.vault.owner}/${res.vault.repo}`;
      process.stdout.write(
        `${kleur.green("ok")}  ${label}  ${kleur.gray(`(${res.vault.branch})`)}\n`,
      );
      if (res.latestCommit) {
        const { sha, message, authorName, authoredAt } = res.latestCommit;
        process.stdout.write(
          `${kleur.dim(sha.slice(0, 7))}  ${message.split("\n")[0]}  ${kleur.dim(
            `— ${authorName ?? "unknown"} ${authoredAt}`,
          )}\n`,
        );
      } else {
        process.stdout.write(kleur.dim("(no commits yet)\n"));
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const membersCmd = defineCommand({
  meta: { name: "members", description: "List members + agents of a vault." },
  args: {
    vaultId: {
      type: "positional",
      description: "Vault id (defaults to the active vault).",
      required: false,
    },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      let vaultId = args.vaultId ? String(args.vaultId) : undefined;
      if (!vaultId) {
        const { activeId } = await nk.vault.listVaults();
        vaultId = activeId ?? undefined;
      }
      if (!vaultId) {
        process.stderr.write(kleur.red("no active vault — pass an id or run `notekit vault switch <id>`\n"));
        process.exitCode = 1;
        return;
      }

      const { members, invitations } = await nk.vault.listVaultMembers(vaultId);
      process.stdout.write(kleur.bold("Members\n"));
      for (const m of members) {
        process.stdout.write(`  ${kleur.dim(m.permission.padEnd(8))}  ${m.login}\n`);
      }
      if (invitations.length > 0) {
        process.stdout.write(kleur.bold("\nPending invitations\n"));
        for (const inv of invitations) {
          process.stdout.write(`  ${kleur.dim(inv.permission.padEnd(8))}  ${inv.inviteeLogin}\n`);
        }
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const migrateCmd = defineCommand({
  meta: {
    name: "migrate",
    description:
      "Copy every note, ticket, and link from one vault into another. The destination must exist; create it first with `notekit vault add`. Pass --delete-source to drop the original vault after a clean migration.",
  },
  args: {
    from: { type: "string", description: "Source vault id.", required: true },
    to: { type: "string", description: "Destination vault id.", required: true },
    deleteSource: {
      type: "boolean",
      description:
        "If set, delete the source vault after a fully clean migration (zero errors). Vault data on the source backend is NOT touched — only the vault registration is removed.",
    },
  },
  async run({ args }) {
    try {
      const nk = await getClient({ requireAuth: true });
      const fromId = String(args.from);
      const toId = String(args.to);
      if (fromId === toId) {
        process.stderr.write(kleur.red("--from and --to must differ\n"));
        process.exitCode = 1;
        return;
      }

      process.stdout.write(
        `${kleur.dim("migrating")} ${kleur.bold(fromId)} ${kleur.dim("→")} ${kleur.bold(toId)}\n`,
      );
      const res = await nk.vault.importFromVault(toId, fromId);
      process.stdout.write(
        `${kleur.green("done")} imported=${res.imported} skipped=${res.skipped} errors=${res.errors.length}\n`,
      );
      if (res.errors.length > 0) {
        for (const e of res.errors.slice(0, 10)) {
          process.stdout.write(`  ${kleur.red("✗")} ${e.path}  ${kleur.dim(e.reason)}\n`);
        }
        if (res.errors.length > 10) {
          process.stdout.write(kleur.dim(`  ...and ${res.errors.length - 10} more\n`));
        }
      }

      if (args.deleteSource) {
        if (res.errors.length > 0) {
          process.stdout.write(
            kleur.yellow(
              "skipping --delete-source: migration had errors; resolve them or re-run without --delete-source first\n",
            ),
          );
          process.exitCode = 1;
          return;
        }
        await nk.vault.deleteVault(fromId);
        process.stdout.write(`${kleur.green("deleted")} source vault ${fromId}\n`);
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

export const vaultCommand = defineCommand({
  meta: { name: "vault", description: "Manage NoteKit vaults." },
  subCommands: {
    list: listCmd,
    switch: switchCmd,
    sync: syncCmd,
    members: membersCmd,
    migrate: migrateCmd,
  },
});
