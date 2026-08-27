// Persistent per-device identity for the HEADLESS MCP server.
//
// The MCP server has no OS keychain (unlike apps/cli) and no IndexedDB (unlike
// the browser), so its device signing key lives in a plain file on the server's
// own disk. The file holds this device's age keypair AND its Model B Ed25519
// signing keypair; the PRIVATE keys never leave this machine and are never
// uploaded to the vault — only the PUBLIC signPub / age recipient are published
// (to the roster) when an owner device approves this MCP device.
//
// Location (first match wins):
//   1. $NOTEKIT_DEVICE_IDENTITY_FILE  — explicit path (best for a pinned VPS)
//   2. $XDG_CONFIG_HOME/notekit/mcp-device.json
//   3. ~/.config/notekit/mcp-device.json
//
// Reuses @notekit/core's generateSigningKeypair so the key shape never drifts
// from the browser/CLI surfaces — there is no duplicate crypto here.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  generateIdentity,
  identityToRecipient,
  generateSigningKeypair,
  type DeviceIdentity,
} from "@notekit/core/crypto";
import { nanoid } from "nanoid";

function identityFilePath(): string {
  const explicit = process.env["NOTEKIT_DEVICE_IDENTITY_FILE"]?.trim();
  if (explicit) return explicit;
  const configHome =
    process.env["XDG_CONFIG_HOME"]?.trim() || join(homedir(), ".config");
  return join(configHome, "notekit", "mcp-device.json");
}

function isDeviceIdentity(value: unknown): value is DeviceIdentity {
  if (!value || typeof value !== "object") return false;
  const device = value as Partial<DeviceIdentity>;
  return (
    typeof device.deviceId === "string" &&
    typeof device.name === "string" &&
    typeof device.identity === "string" &&
    typeof device.recipient === "string" &&
    typeof device.createdAt === "string"
  );
}

async function readStoredIdentity(): Promise<DeviceIdentity | null> {
  try {
    const raw = await readFile(identityFilePath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isDeviceIdentity(parsed) ? parsed : null;
  } catch {
    // Missing file / unreadable / malformed — treat as "no identity yet". We
    // fail-closed on trust (an unenrolled device can't manage others), so an
    // absent file here is not a security downgrade, just "generate one".
    return null;
  }
}

async function writeStoredIdentity(device: DeviceIdentity): Promise<void> {
  const path = identityFilePath();
  await mkdir(dirname(path), { recursive: true });
  // 0o600: the signing PRIVATE key is in here — keep it owner-only on disk.
  await writeFile(path, JSON.stringify(device, null, 2), { mode: 0o600 });
}

/**
 * Load this MCP server's persistent device identity, creating it on first run.
 * The keypair is generated once and reused across restarts so the server keeps a
 * stable roster identity. Back-fills a Model B signing keypair for an identity
 * file written before signing keys existed, mirroring the CLI/browser upgrade
 * path — generating it locally grants no authority until an in-roster device
 * vouches for it.
 */
export async function loadMcpDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await readStoredIdentity();
  if (existing) {
    if (!existing.signPublicKey || !existing.signPrivateKey) {
      const upgraded: DeviceIdentity = { ...existing, ...generateSigningKeypair() };
      await writeStoredIdentity(upgraded);
      return upgraded;
    }
    return existing;
  }
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  const device: DeviceIdentity = {
    deviceId: `mcp-${nanoid(8)}`,
    name: "notekit-mcp",
    kind: "mcp",
    identity,
    recipient,
    createdAt: new Date().toISOString(),
    ...generateSigningKeypair(),
  };
  await writeStoredIdentity(device);
  return device;
}
