/**
 * Per-secret storage. Each secret lives at `.notekit/secrets/{NAME}.age` —
 * an armored age file encrypting a SecretEntry JSON to all device pubkeys +
 * the recovery pubkey. This gives each secret independent git history so
 * HistoryView can show commits scoped to a single secret file.
 *
 * The vault layout (all under `.notekit/`):
 *   - `devices/{deviceId}.json` — public pubkey registry
 *   - `recovery.json`           — recovery pubkey (BIP39-derived)
 *   - `secrets/{NAME}.age`      — one armored age file per secret
 */
import * as vault from "./vault-api";
import { encryptSecrets, decryptSecrets } from "./crypto/vault-crypto";
import { readFileAtRef } from "./vault-api";
import type { DeviceIdentity } from "./crypto/device-key";

export const DEVICES_PREFIX = ".notekit/devices/";
export const RECOVERY_PATH = ".notekit/recovery.json";
export const SECRETS_PREFIX = ".notekit/secrets/";

/** Path of the old single-blob format — used only for migration. */
const LEGACY_SECRETS_PATH = ".notekit/secrets.age";

export interface DeviceRecord {
  deviceId: string;
  name: string;
  recipient: string;
  addedAt: string;
}

export interface RecoveryRecord {
  recipient: string;
  createdAt: string;
}

export interface SecretEntry {
  value: string;
  updatedAt: string;
}

const shaCache = new Map<string, string>();

function secretPath(name: string): string {
  return `${SECRETS_PREFIX}${name}.age`;
}

function devicePath(deviceId: string): string {
  return `${DEVICES_PREFIX}${deviceId}.json`;
}

export async function listDevices(): Promise<DeviceRecord[]> {
  const { entries } = await vault.listFiles(DEVICES_PREFIX);
  const devices: DeviceRecord[] = [];
  for (const e of entries) {
    if (!e.path.endsWith(".json")) continue;
    const file = await vault.readFile(e.path);
    if (file.sha) shaCache.set(file.path, file.sha);
    if (typeof file.content !== "string") continue;
    try {
      devices.push(JSON.parse(file.content) as DeviceRecord);
    } catch {
      // ignore malformed
    }
  }
  return devices;
}

export async function readRecovery(): Promise<RecoveryRecord | null> {
  const file = await vault.readFile(RECOVERY_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string") return null;
  try {
    return JSON.parse(file.content) as RecoveryRecord;
  } catch {
    return null;
  }
}

async function collectRecipients(device: DeviceIdentity): Promise<string[]> {
  const [devices, recovery] = await Promise.all([listDevices(), readRecovery()]);
  const recipients = new Set<string>();
  for (const d of devices) recipients.add(d.recipient);
  recipients.add(device.recipient);
  if (recovery) recipients.add(recovery.recipient);
  return Array.from(recipients);
}

async function ensureSha(path: string): Promise<void> {
  if (shaCache.has(path)) return;
  const file = await vault.readFile(path);
  if (file.sha) shaCache.set(path, file.sha);
}

async function writeDeviceRecord(record: DeviceRecord, message: string) {
  const path = devicePath(record.deviceId);
  const result = await vault.writeFile(
    path,
    JSON.stringify(record, null, 2),
    message,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

async function writeRecoveryRecord(record: RecoveryRecord, message: string) {
  const result = await vault.writeFile(
    RECOVERY_PATH,
    JSON.stringify(record, null, 2),
    message,
    shaCache.get(RECOVERY_PATH),
  );
  shaCache.set(RECOVERY_PATH, result.sha);
}

/** Re-encrypt every existing secret for an updated recipient list. */
async function reEncryptAll(
  signer: DeviceIdentity,
  recipients: string[],
  commitMessage: (name: string) => string,
): Promise<void> {
  const { entries } = await vault.listFiles(SECRETS_PREFIX);
  for (const e of entries) {
    if (!e.path.endsWith(".age")) continue;
    const file = await vault.readFile(e.path);
    if (!file.sha || typeof file.content !== "string" || !file.content) continue;
    shaCache.set(e.path, file.sha);
    const name = e.path.slice(SECRETS_PREFIX.length, -".age".length);
    const json = await decryptSecrets(file.content, signer.identity);
    const armored = await encryptSecrets(json, recipients);
    const result = await vault.writeFile(e.path, armored, commitMessage(name), file.sha);
    shaCache.set(e.path, result.sha);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function isVaultInitialized(): Promise<boolean> {
  const file = await vault.readFile(RECOVERY_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  return typeof file.content === "string" && file.content.length > 0;
}

export interface InitVaultArgs {
  device: DeviceIdentity;
  recoveryRecipient: string;
}

export async function initVault({ device, recoveryRecipient }: InitVaultArgs): Promise<void> {
  const now = new Date().toISOString();
  await writeRecoveryRecord(
    { recipient: recoveryRecipient, createdAt: now },
    "Initialize crypto vault: set recovery key",
  );
  await writeDeviceRecord(
    { deviceId: device.deviceId, name: device.name, recipient: device.recipient, addedAt: now },
    `Initialize crypto vault: register device "${device.name}"`,
  );
}

export async function listSecretNames(): Promise<string[]> {
  const { entries } = await vault.listFiles(SECRETS_PREFIX);
  const names: string[] = [];
  for (const e of entries) {
    if (!e.path.endsWith(".age")) continue;
    shaCache.set(e.path, e.sha);
    names.push(e.path.slice(SECRETS_PREFIX.length, -".age".length));
  }
  return names.sort();
}

export async function getSecret(
  name: string,
  device: DeviceIdentity,
): Promise<string | null> {
  const path = secretPath(name);
  const file = await vault.readFile(path);
  if (file.sha) shaCache.set(path, file.sha);
  if (typeof file.content !== "string" || !file.content) return null;
  const json = await decryptSecrets(file.content, device.identity);
  const entry = JSON.parse(json) as SecretEntry;
  return entry.value;
}

export async function setSecret(
  name: string,
  value: string,
  device: DeviceIdentity,
): Promise<void> {
  const path = secretPath(name);
  await ensureSha(path);
  const existed = shaCache.has(path);
  const entry: SecretEntry = { value, updatedAt: new Date().toISOString() };
  const recipients = await collectRecipients(device);
  const armored = await encryptSecrets(JSON.stringify(entry), recipients);
  const result = await vault.writeFile(
    path,
    armored,
    existed ? `Rotate secret "${name}"` : `Set secret "${name}"`,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

export async function removeSecret(
  name: string,
  _device: DeviceIdentity,
): Promise<void> {
  const path = secretPath(name);
  await ensureSha(path);
  const sha = shaCache.get(path);
  if (!sha) return;
  await vault.deleteFile(path, sha, `Remove secret "${name}"`);
  shaCache.delete(path);
}

export async function addDevice(
  newDevice: { deviceId: string; name: string; recipient: string },
  signer: DeviceIdentity,
): Promise<void> {
  const now = new Date().toISOString();
  await writeDeviceRecord(
    { deviceId: newDevice.deviceId, name: newDevice.name, recipient: newDevice.recipient, addedAt: now },
    `Add device "${newDevice.name}"`,
  );
  const recipients = await collectRecipients(signer);
  await reEncryptAll(
    signer,
    recipients,
    (n) => `Re-encrypt secret "${n}" for device "${newDevice.name}"`,
  );
}

export async function removeDevice(
  deviceId: string,
  signer: DeviceIdentity,
): Promise<void> {
  const path = devicePath(deviceId);
  const file = await vault.readFile(path);
  if (!file.sha) return;
  let removedName = deviceId;
  if (typeof file.content === "string") {
    try { removedName = (JSON.parse(file.content) as DeviceRecord).name ?? deviceId; } catch { /* keep id */ }
  }
  await vault.deleteFile(path, file.sha, `Revoke device "${removedName}"`);
  shaCache.delete(path);
  const recipients = await collectRecipients(signer);
  await reEncryptAll(
    signer,
    recipients,
    (n) => `Re-encrypt secret "${n}" after revoking "${removedName}"`,
  );
}

/**
 * Restore a secret to the value it held at a given commit SHA.
 * Fetches the encrypted file at that commit, decrypts it with the current
 * device key, then re-encrypts and writes it as the new HEAD version.
 */
export async function restoreSecret(
  name: string,
  commitSha: string,
  device: DeviceIdentity,
): Promise<void> {
  const path = secretPath(name);
  const file = await readFileAtRef(path, commitSha);
  if (typeof file.content !== "string" || !file.content) {
    throw new Error(`Secret "${name}" not found at commit ${commitSha.slice(0, 7)}`);
  }
  const json = await decryptSecrets(file.content, device.identity);
  const entry = JSON.parse(json) as SecretEntry;
  await setSecret(name, entry.value, device);
}

/**
 * One-time migration: if the legacy single-blob `.notekit/secrets.age` exists,
 * split it into per-secret files then delete the blob.
 * Returns true if migration ran, false if there was nothing to migrate.
 */
export async function migrateFromBlob(device: DeviceIdentity): Promise<boolean> {
  const file = await vault.readFile(LEGACY_SECRETS_PATH);
  if (!file.sha || typeof file.content !== "string" || !file.content) return false;

  interface LegacyDoc {
    version: 1;
    secrets: Record<string, SecretEntry>;
  }

  let doc: LegacyDoc;
  try {
    const json = await decryptSecrets(file.content, device.identity);
    doc = JSON.parse(json) as LegacyDoc;
    if (!doc.secrets || typeof doc.secrets !== "object") return false;
  } catch {
    return false;
  }

  const recipients = await collectRecipients(device);
  for (const [name, entry] of Object.entries(doc.secrets)) {
    const path = secretPath(name);
    const armored = await encryptSecrets(JSON.stringify(entry), recipients);
    const result = await vault.writeFile(path, armored, `Migrate secret "${name}"`, undefined);
    shaCache.set(path, result.sha);
  }

  await vault.deleteFile(LEGACY_SECRETS_PATH, file.sha, "Remove legacy secrets.age after migration");
  return true;
}
