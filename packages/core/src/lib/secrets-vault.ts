/**
 * High-level secrets vault. Reads and writes `.notekit/secrets.age` in the
 * GitHub-backed vault. Each call decrypts → mutates → re-encrypts to every
 * device pubkey + the recovery pubkey, then commits.
 *
 * The vault layout (all under `.notekit/`):
 *   - `devices/{deviceId}.json` — public pubkey registry, one file per device
 *   - `recovery.json`           — recovery pubkey (BIP39-derived)
 *   - `secrets.age`             — armored age file, the actual encrypted blob
 */
import * as vault from "./vault-api";
import {
  encryptSecrets,
  decryptSecrets,
} from "./crypto/vault-crypto";
import type { DeviceIdentity } from "./crypto/device-key";

export const DEVICES_PREFIX = ".notekit/devices/";
export const RECOVERY_PATH = ".notekit/recovery.json";
export const SECRETS_PATH = ".notekit/secrets.age";

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

interface SecretsDoc {
  version: 1;
  secrets: Record<string, SecretEntry>;
}

const shaCache = new Map<string, string>();

function emptyDoc(): SecretsDoc {
  return { version: 1, secrets: {} };
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

async function readSecretsDoc(
  device: DeviceIdentity,
): Promise<SecretsDoc> {
  const file = await vault.readFile(SECRETS_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string" || file.content.length === 0) {
    return emptyDoc();
  }
  const json = await decryptSecrets(file.content, device.identity);
  try {
    const parsed = JSON.parse(json) as SecretsDoc;
    if (parsed.version !== 1 || typeof parsed.secrets !== "object") {
      return emptyDoc();
    }
    return parsed;
  } catch {
    return emptyDoc();
  }
}

async function collectRecipients(
  device: DeviceIdentity,
): Promise<string[]> {
  const [devices, recovery] = await Promise.all([
    listDevices(),
    readRecovery(),
  ]);
  const recipients = new Set<string>();
  for (const d of devices) recipients.add(d.recipient);
  recipients.add(device.recipient);
  if (recovery) recipients.add(recovery.recipient);
  return Array.from(recipients);
}

async function writeSecretsDoc(
  doc: SecretsDoc,
  recipients: string[],
  message: string,
): Promise<void> {
  const json = JSON.stringify(doc, null, 2);
  const armored = await encryptSecrets(json, recipients);
  const result = await vault.writeFile(
    SECRETS_PATH,
    armored,
    message,
    shaCache.get(SECRETS_PATH),
  );
  shaCache.set(SECRETS_PATH, result.sha);
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

async function writeRecoveryRecord(
  record: RecoveryRecord,
  message: string,
) {
  const result = await vault.writeFile(
    RECOVERY_PATH,
    JSON.stringify(record, null, 2),
    message,
    shaCache.get(RECOVERY_PATH),
  );
  shaCache.set(RECOVERY_PATH, result.sha);
}

export interface InitVaultArgs {
  device: DeviceIdentity;
  recoveryRecipient: string;
}

export async function isVaultInitialized(): Promise<boolean> {
  const file = await vault.readFile(SECRETS_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  return typeof file.content === "string" && file.content.length > 0;
}

export async function initVault({
  device,
  recoveryRecipient,
}: InitVaultArgs): Promise<void> {
  const now = new Date().toISOString();

  await writeRecoveryRecord(
    { recipient: recoveryRecipient, createdAt: now },
    "Initialize crypto vault: set recovery key",
  );

  await writeDeviceRecord(
    {
      deviceId: device.deviceId,
      name: device.name,
      recipient: device.recipient,
      addedAt: now,
    },
    `Initialize crypto vault: register device "${device.name}"`,
  );

  await writeSecretsDoc(
    emptyDoc(),
    [device.recipient, recoveryRecipient],
    "Initialize crypto vault: empty secrets",
  );
}

export async function listSecretNames(
  device: DeviceIdentity,
): Promise<string[]> {
  const doc = await readSecretsDoc(device);
  return Object.keys(doc.secrets).sort();
}

export async function getSecret(
  name: string,
  device: DeviceIdentity,
): Promise<string | null> {
  const doc = await readSecretsDoc(device);
  return doc.secrets[name]?.value ?? null;
}

export async function setSecret(
  name: string,
  value: string,
  device: DeviceIdentity,
): Promise<void> {
  const doc = await readSecretsDoc(device);
  const existed = name in doc.secrets;
  doc.secrets[name] = { value, updatedAt: new Date().toISOString() };
  const recipients = await collectRecipients(device);
  await writeSecretsDoc(
    doc,
    recipients,
    existed ? `Rotate secret "${name}"` : `Set secret "${name}"`,
  );
}

export async function removeSecret(
  name: string,
  device: DeviceIdentity,
): Promise<void> {
  const doc = await readSecretsDoc(device);
  if (!(name in doc.secrets)) return;
  delete doc.secrets[name];
  const recipients = await collectRecipients(device);
  await writeSecretsDoc(doc, recipients, `Remove secret "${name}"`);
}

export async function addDevice(
  newDevice: { deviceId: string; name: string; recipient: string },
  signer: DeviceIdentity,
): Promise<void> {
  const now = new Date().toISOString();
  await writeDeviceRecord(
    {
      deviceId: newDevice.deviceId,
      name: newDevice.name,
      recipient: newDevice.recipient,
      addedAt: now,
    },
    `Add device "${newDevice.name}"`,
  );
  const doc = await readSecretsDoc(signer);
  const recipients = await collectRecipients(signer);
  await writeSecretsDoc(
    doc,
    recipients,
    `Re-encrypt secrets for device "${newDevice.name}"`,
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
    try {
      removedName = (JSON.parse(file.content) as DeviceRecord).name ?? deviceId;
    } catch {
      // keep id
    }
  }
  await vault.deleteFile(path, file.sha, `Revoke device "${removedName}"`);
  shaCache.delete(path);

  const doc = await readSecretsDoc(signer);
  const recipients = await collectRecipients(signer);
  await writeSecretsDoc(
    doc,
    recipients,
    `Re-encrypt secrets after revoking "${removedName}"`,
  );
}
