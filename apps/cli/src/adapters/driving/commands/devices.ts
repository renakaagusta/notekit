// `notekit devices <sub>` — list the trusted devices on the active E2EE vault
// and revoke one. These drive the SAME @notekit/core ops the in-app UI and the
// MCP tools call: the trust rules (roster chain, key rotation) live in the core,
// never here — a command only parses input, calls one op, and formats output.

import {
  currentRoster,
  deviceSigner,
  listDevices,
  listRosterDevices,
  removeDevice,
  rosterEntryForDevice,
  revokeRosterDevice,
} from "@notekit/core/secrets";
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

export const devicesCommand = defineCommand({
  meta: { name: "devices", description: "List and revoke trusted E2EE devices." },
  subCommands: {
    list: listCmd,
    revoke: revokeCmd,
  },
});
