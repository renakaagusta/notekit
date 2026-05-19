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
  meta: { name: "sync", description: "Pull / push the active vault. (placeholder)" },
  async run() {
    // Phase 2 TODO: api-client doesn't expose a sync trigger yet. The web app
    // syncs implicitly on every write; CLI should hit a `/vault/sync` endpoint
    // once it lands. For now we no-op so scripts don't blow up.
    process.stdout.write(kleur.yellow("TODO: vault sync is not wired up yet. See docs/PLAN.md (Phase 2).\n"));
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

export const vaultCommand = defineCommand({
  meta: { name: "vault", description: "Manage NoteKit vaults." },
  subCommands: { list: listCmd, switch: switchCmd, sync: syncCmd, members: membersCmd },
});
