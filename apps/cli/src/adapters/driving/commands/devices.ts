// `notekit devices <sub>` — list the trusted devices on the active E2EE vault
// and revoke one. These drive the SAME @notekit/core ops the in-app UI and the
// MCP tools call: the trust rules (roster chain, key rotation) live in the core,
// never here — a command only parses input, calls one op, and formats output.

import { deriveFingerprint, formatFingerprint } from "@notekit/core/crypto";
import {
  approveDeviceViaRoster,
  currentRoster,
  deviceSigner,
  listDevices,
  listRosterDevices,
  removeDevice,
  rosterEntryForDevice,
  revokeRosterDevice,
} from "@notekit/core/secrets";
import type { DeviceKind } from "@notekit/core/types";
import { defineCommand } from "citty";
import kleur from "kleur";
import {
  dieWithError,
  vaultDevice,
  getSecretsClient,
} from "../../../composition/index.js";

const listCmd = defineCommand({
  meta: {
    name: "list",
    description: "List the devices trusted on the active end-to-end-encrypted vault.",
  },
  async run() {
    try {
      await getSecretsClient({ requireAuth: true });
      const self = await vaultDevice();
      const roster = await listRosterDevices(self);
      if (roster) {
        if (roster.length === 0) {
          process.stdout.write(kleur.dim("(no devices)\n"));
          return;
        }
        for (const device of roster) {
          const marker = device.isSelf ? kleur.green("*") : " ";
          const suffix = kleur.dim(`···${device.deviceId.slice(-4)}`);
          process.stdout.write(`${marker} ${device.name}  ${suffix}\n`);
        }
        return;
      }
      // Legacy (no roster): fall back to the committed device records.
      const devices = await listDevices();
      if (devices.length === 0) {
        process.stdout.write(kleur.dim("(no devices)\n"));
        return;
      }
      for (const device of devices) {
        const marker = device.deviceId === self.deviceId ? kleur.green("*") : " ";
        const suffix = kleur.dim(`···${device.deviceId.slice(-4)}`);
        process.stdout.write(`${marker} ${device.name}  ${suffix}\n`);
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const revokeCmd = defineCommand({
  meta: {
    name: "revoke",
    description:
      "Revoke a device from the active vault. On a Model B (per-device-key) vault this rotates the vault key with THIS device's key — no recovery phrase — so the revoked device can't read future changes (forward-only). Already-synced copies stay on that machine.",
  },
  args: {
    deviceId: {
      type: "positional",
      description: "The device id to revoke (from `notekit devices list`).",
      required: true,
    },
  },
  async run({ args }) {
    try {
      await getSecretsClient({ requireAuth: true });
      const self = await vaultDevice();
      const deviceId = String(args.deviceId);
      const roster = await currentRoster();
      if (roster) {
        if (!deviceSigner(self)) {
          throw new Error(
            "This CLI has no device signing key yet. Run `notekit vault pair` to link it as a trusted device, then revoke from here.",
          );
        }
        const entry = await rosterEntryForDevice(deviceId);
        if (!entry) {
          throw new Error(`No device "${deviceId}" in the current roster.`);
        }
        if (entry.deviceId === self.deviceId) {
          throw new Error("A device can't revoke itself — revoke it from another trusted device.");
        }
        await revokeRosterDevice(self, { signPub: entry.signPub, deviceId });
        process.stdout.write(kleur.green(`Revoked "${entry.name}" and rotated the vault key.\n`));
        return;
      }
      // Legacy vault: removeDevice handles rotation/re-encrypt; it demands the
      // recovery phrase itself when the vault is signed-mode.
      await removeDevice(deviceId, self);
      process.stdout.write(kleur.green(`Revoked device "${deviceId}".\n`));
    } catch (err) {
      dieWithError(err);
    }
  },
});

const approveCmd = defineCommand({
  meta: {
    name: "approve",
    description:
      "Approve a device that announced a pairing code (from `notekit vault pair` or the MCP's devices_pair). This CLI must already be a trusted roster device; it vouches for the new one with its own key — no recovery phrase. VERIFY the emoji safety number matches the other screen before confirming.",
  },
  args: {
    code: { type: "positional", description: "The 6-digit pairing code.", required: true },
    yes: { type: "boolean", description: "Skip the interactive safety-number confirmation.", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const self = await vaultDevice();
      const roster = await currentRoster();
      if (!roster) {
        throw new Error("This vault has no Model B roster — approve from the app instead.");
      }
      const selfSigner = deviceSigner(self);
      if (!selfSigner || !roster.entries.some((e) => e.signPub === selfSigner.signPub)) {
        throw new Error(
          "This CLI isn't a trusted roster device, so it can't approve another. Pair it first (`notekit vault pair`).",
        );
      }
      const announcement = await nk.vault.fetchPair(String(args.code).trim());
      if (!announcement) throw new Error("Pairing code not found or expired.");
      if (!announcement.signPub) {
        throw new Error("That device didn't publish a signing key (pre-Model-B) — approve from the app.");
      }

      const fingerprint = formatFingerprint(await deriveFingerprint(announcement.pubkey));
      process.stdout.write(
        `\nApproving ${kleur.bold(announcement.deviceName)}` +
          (announcement.deviceKind ? kleur.dim(` (${announcement.deviceKind})`) : "") +
          `  ${kleur.dim(`···${announcement.deviceId.slice(-4)}`)}\n`,
      );
      process.stdout.write(`Safety number: ${kleur.cyan(fingerprint)}\n`);
      process.stdout.write(kleur.dim("Confirm this matches the code shown on the other device.\n\n"));

      if (!args.yes) {
        const ok = await confirm("Approve this device?");
        if (!ok) {
          process.stdout.write(kleur.yellow("Aborted.\n"));
          return;
        }
      }

      await approveDeviceViaRoster(self, {
        deviceId: announcement.deviceId,
        name: announcement.deviceName,
        recipient: announcement.pubkey,
        signPub: announcement.signPub,
        ...(announcement.deviceKind ? { kind: announcement.deviceKind as DeviceKind } : {}),
      });
      await nk.vault.clearPair(String(args.code).trim()).catch(() => undefined);
      process.stdout.write(kleur.green(`Approved "${announcement.deviceName}" — it can now read this vault with its own key.\n`));
    } catch (err) {
      dieWithError(err);
    }
  },
});

/** Minimal yes/no prompt on stdin (no dependency — devices approve is the only user). */
function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(`${question} [y/N] `);
    const onData = (chunk: Buffer) => {
      process.stdin.pause();
      process.stdin.off("data", onData);
      resolve(/^y(es)?$/i.test(chunk.toString().trim()));
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

export const devicesCommand = defineCommand({
  meta: { name: "devices", description: "List, approve, and revoke trusted E2EE devices." },
  subCommands: {
    list: listCmd,
    approve: approveCmd,
    revoke: revokeCmd,
  },
});
