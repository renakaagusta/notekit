// Device-management tools — list the trusted devices on the active E2EE vault
// and revoke one. These drive the SAME @notekit/core ops the in-app UI and the
// CLI call; the trust rules live in the core, not here.
//
// Parity note (honest, not hidden): the MCP server is headless and holds only
// the master recovery phrase (NOTEKIT_RECOVERY_PHRASE), so it acts in the
// master role — not as a roster-trusted device. `devices_list` works on any
// vault. `devices_revoke` works on a LEGACY (no-roster) vault via the recovery
// key; on a Model B roster vault it fails closed and asks the operator to revoke
// from a trusted device (in-app or `notekit devices revoke`), because a
// roster-signed revoke needs a per-device signing key the server doesn't have.
// Wiring the server as its own roster device is future work.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import {
  currentRoster,
  listDevices,
  listRosterDevices,
  removeDevice,
} from "@notekit/core/secrets";
import { z } from "zod";
import {
  errorContent,
  jsonContent,
  recoverySigningFromEnv,
  textContent,
  vaultDevice,
} from "../../../composition/index.js";

export function registerDeviceTools(server: McpServer, _nk: NoteKitApi): void {
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

  server.registerTool(
    "devices_revoke",
    {
      title: "Revoke a device",
      description:
        "Revoke a device from the active vault (forward-only: it loses access to future changes; already-synced copies stay on that machine). Works on a legacy vault via the recovery phrase. On a Model B roster vault, revoke from a trusted device instead (in-app or `notekit devices revoke`).",
      inputSchema: {
        deviceId: z.string().min(1).describe("The device id from devices_list."),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ deviceId }) => {
      try {
        if (await currentRoster()) {
          return errorContent(
            "This vault uses per-device approvals (Model B). The MCP server holds only the master phrase, not a trusted device key, so it can't sign a roster revoke. Revoke from a trusted device: in the app under Account → Devices, or `notekit devices revoke`.",
          );
        }
        const self = await vaultDevice();
        // Pass the master signing key so a signed legacy vault can re-sign the
        // rotated keybox; removeDevice no-ops the signing arg on unsigned vaults.
        const signing = await recoverySigningFromEnv();
        await removeDevice(deviceId, self, signing ?? undefined);
        return textContent(`Revoked device ${deviceId}.`);
      } catch (err) {
        return errorContent(`devices_revoke failed: ${(err as Error).message}`);
      }
    },
  );
}
