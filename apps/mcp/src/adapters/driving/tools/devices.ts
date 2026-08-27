// Device-management tools — list the trusted devices on the active E2EE vault
// and revoke one. These drive the SAME @notekit/core ops the in-app UI and the
// CLI call; the trust rules (roster chain, key rotation) live in the core, not
// here — a tool only parses input, calls one op, and formats output.
//
// Least-privilege boundary (honest, not hidden): the MCP server has a PERSISTENT
// per-device signing key of its own (see adapters/driven/device-identity.ts).
// But device management (revoking OTHER devices) is an owner-level power, so the
// server is NOT auto-enrolled: its signPub must be explicitly approved by an
// owner device (human safety-number verification) via the normal pairing flow.
//   - `devices_list` works on any vault (roster or legacy).
//   - `devices_revoke` on a Model B roster vault is roster-signed with THIS
//     server's device key — but ONLY once the server's device is enrolled in the
//     roster. If it isn't enrolled yet, it FAILS CLOSED with a clear message
//     rather than falling back to the master phrase. On a legacy (no-roster)
//     vault it revokes via the recovery key as before.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import {
  currentRoster,
  deviceSigner,
  listDevices,
  listRosterDevices,
  removeDevice,
  rosterEntryForDevice,
  revokeRosterDevice,
} from "@notekit/core/secrets";
import { z } from "zod";
import {
  errorContent,
  jsonContent,
  recoverySigningFromEnv,
  textContent,
  vaultDevice,
} from "../../../composition/index.js";

export function registerDeviceTools(server: McpServer, nk: NoteKitApi): void {
  registerPairTool(server, nk);
  registerListTool(server);
  registerRevokeTool(server);
}

function registerPairTool(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "devices_pair",
    {
      title: "Enroll this MCP server as a trusted device",
      description:
        "Announce a 6-digit pairing code so an OWNER can approve this MCP server as a trusted Model B device (NoteKit → Account → Devices → Link a device). Approval is explicit and human-verified — the server never auto-enrolls itself. Once approved, devices_revoke works with no master phrase. The code expires in 5 minutes; run devices_list afterwards to confirm enrollment.",
      inputSchema: {},
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async () => {
      try {
        const self = await vaultDevice();
        const signer = deviceSigner(self);
        if (!signer) {
          return errorContent(
            "This MCP server has no device signing key, so it can't be enrolled in a Model B roster.",
          );
        }
        const roster = await listRosterDevices(self);
        if (roster?.some((d) => d.isSelf)) {
          return textContent("This MCP server is already a trusted device on this vault.");
        }
        const code = generatePairingCode();
        await nk.vault.announcePair({
          code,
          pubkey: self.recipient,
          deviceName: self.name,
          deviceId: self.deviceId,
          signPub: signer.signPub,
          ...(self.kind ? { deviceKind: self.kind } : {}),
        });
        return textContent(
          [
            `Pairing code: ${code.slice(0, 3)} ${code.slice(3)}`,
            "",
            "Approve on an OWNER device: NoteKit → Account → Devices → \"Link a device\", enter the code.",
            "The code expires in 5 minutes. Run devices_list afterwards to confirm this server is enrolled.",
          ].join("\n"),
        );
      } catch (err) {
        return errorContent(`devices_pair failed: ${(err as Error).message}`);
      }
    },
  );
}

function registerListTool(server: McpServer): void {
  server.registerTool(
    "devices_list",
    {
      title: "List trusted devices",
      description:
        "List the devices trusted on the active end-to-end-encrypted vault. On a Model B (per-device-key) vault this is the signed device roster; otherwise it's the committed device records.",
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => {
      try {
        const self = await vaultDevice();
        const roster = await listRosterDevices(self);
        if (roster) {
          return jsonContent({
            mode: "roster",
            devices: roster.map((d) => ({
              deviceId: d.deviceId,
              name: d.name,
              addedAt: d.addedAt,
              isSelf: d.isSelf,
            })),
          });
        }
        const devices = await listDevices();
        return jsonContent({
          mode: "legacy",
          devices: devices.map((d) => ({
            deviceId: d.deviceId,
            name: d.name,
            addedAt: d.addedAt,
            owner: d.owner,
          })),
        });
      } catch (err) {
        return errorContent(`devices_list failed: ${(err as Error).message}`);
      }
    },
  );
}

function registerRevokeTool(server: McpServer): void {
  server.registerTool(
    "devices_revoke",
    {
      title: "Revoke a device",
      description:
        "Revoke a device from the active vault (forward-only: it loses access to future changes; already-synced copies stay on that machine). On a Model B roster vault this rotates the vault key with THIS server's device key — but only if this server's device has been approved into the roster by an owner. On a legacy vault it uses the recovery phrase.",
      inputSchema: {
        deviceId: z.string().min(1).describe("The device id from devices_list."),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ deviceId }) => {
      try {
        const self = await vaultDevice();
        const roster = await currentRoster();
        if (roster) {
          return await revokeViaRoster(self, deviceId);
        }
        // Legacy vault: pass the master signing key so a signed legacy vault can
        // re-sign the rotated keybox; removeDevice no-ops it on unsigned vaults.
        const signing = await recoverySigningFromEnv();
        await removeDevice(deviceId, self, signing ?? undefined);
        return textContent(`Revoked device ${deviceId}.`);
      } catch (err) {
        return errorContent(`devices_revoke failed: ${(err as Error).message}`);
      }
    },
  );
}

/** A cryptographically uniform 6-digit pairing code (no modulo bias). */
function generatePairingCode(): string {
  const buffer = new Uint32Array(1);
  const limit = 4_294_000_000;
  do {
    globalThis.crypto.getRandomValues(buffer);
  } while ((buffer[0] ?? 0) >= limit);
  return ((buffer[0] ?? 0) % 1_000_000).toString().padStart(6, "0");
}

/**
 * Roster-signed revoke for a Model B vault. Fails closed unless this server's
 * device is a trusted roster member — the server never falls back to the master
 * phrase to force a revoke, because owner-level device management must be an
 * explicitly-approved capability, not a silent one.
 */
async function revokeViaRoster(
  self: Awaited<ReturnType<typeof vaultDevice>>,
  deviceId: string,
) {
  if (!deviceSigner(self)) {
    return errorContent(
      "This MCP server has no device signing key. It can't manage a Model B vault until it's enrolled.",
    );
  }
  const roster = await listRosterDevices(self);
  const selfEnrolled = roster?.some((d) => d.isSelf) ?? false;
  if (!selfEnrolled) {
    return errorContent(
      "This MCP server's device isn't approved on this vault's roster, so it can't sign a revoke. Approve it first from an owner device (NoteKit → Account → Devices → Link a device), then retry. The server is never auto-granted device-management power.",
    );
  }
  const entry = await rosterEntryForDevice(deviceId);
  if (!entry) {
    return errorContent(`No device "${deviceId}" in the current roster.`);
  }
  if (entry.deviceId === self.deviceId) {
    return errorContent(
      "A device can't revoke itself — revoke it from another trusted device.",
    );
  }
  await revokeRosterDevice(self, { signPub: entry.signPub, deviceId });
  return textContent(`Revoked "${entry.name}" and rotated the vault key.`);
}
