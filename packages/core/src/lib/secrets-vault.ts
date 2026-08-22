/**
 * Per-secret storage. Each secret lives at `.notekit/secrets/{NAME}.age` for
 * the Default vault, or `.notekit/secrets/{slug}/{NAME}.age` when grouped
 * under a named secret vault. Files are armored age, encrypting a SecretEntry
 * JSON to all device pubkeys + the recovery pubkey. Each secret keeps its own
 * git history so HistoryView can scope commits to a single file.
 *
 * The vault layout (all under `.notekit/`):
 *   - `devices/{deviceId}.json`          — public pubkey registry
 *   - `recovery.json`                    — recovery pubkey (BIP39-derived)
 *   - `secrets/{NAME}.age`               — Default-vault secret
 *   - `secrets/{slug}/{NAME}.age`        — secret inside a named vault
 *   - `secrets/_vaults.json`             — index of named vaults (unencrypted)
 *
 * Named-vault slugs are URL-safe identifiers used as folder names; labels are
 * human-readable display names stored in the index. The Default vault has no
 * slug — its secrets sit directly under `secrets/`.
 */

// ─── Core state & primitives ─────────────────────────────────────────────────
export {
  type SecretsBackend,
  configureSecretsBackend,
  configureSecretsCache,
  noopSecretsCache,
  beginVaultReadWindow,
  endVaultReadWindow,
  vaultReadServedFromCache,
  prefetchBootstrapFiles,
  secretsBackendFromApi,
  DEVICES_PREFIX,
  RECOVERY_PATH,
  SECRETS_PREFIX,
  VAULTS_INDEX_PATH,
  CONFIG_PATH,
  KEYBOX_PATH,
  MEMBERS_PREFIX,
  DEFAULT_VAULT_SLUG,
  DEFAULT_VAULT_LABEL,
  type DeviceRecord,
  type MemberRecord,
  type MemberRegistry,
  deviceRecordTrustedByMember,
  type RecoveryRecord,
  type SignedDeviceFields,
  deviceRecordTrusted,
  type VaultConfig,
  type SecretEntry,
  type SecretVaultRecord,
  type SecretRef,
  listDevices,
  readMembers,
  readRecovery,
  readVaultConfig,
  keyboxExists,
  unlockVaultKey,
  addSelfToKeybox,
  setActiveVaultKey,
  getActiveVaultKey,
  encryptVaultContent,
  encryptVaultContentMany,
  decryptVaultContent,
  getVaultBackend,
  collectVaultRecipients,
} from "./secrets-vault-core";

// ─── Sharing ─────────────────────────────────────────────────────────────────
export {
  SHARES_PREFIX,
  type ShareGrant,
  type ShareManifest,
  type PassphraseShare,
  readShareManifest,
  extraRecipientsForItem,
  recipientsForItem,
  shareItemWith,
  createPassphraseShare,
  listItemShares,
  unshareItemWith,
} from "./secrets-vault-sharing";

// ─── Re-encryption helpers ────────────────────────────────────────────────────
export {
  reEncryptChats,
  reEncryptVaultIfMembersChanged,
} from "./secrets-vault-reencrypt";

// ─── Device & member management ───────────────────────────────────────────────
export {
  type ForeignDeviceRecord,
  type SelfRegisterResult,
  addDevice,
  removeDevice,
  ensureOwnerMember,
  ensureSelfRegistered,
  addMember,
  removeMember,
} from "./secrets-vault-membership";

// ─── Remaining imports for this module ───────────────────────────────────────
import type { DeviceIdentity } from "./crypto/device-key";
import type { RecoverySigningKey } from "./crypto/recovery";
import {
  encryptSecrets,
  decryptSecrets,
} from "./crypto/vault-crypto";
import { getSecretsCache } from "./secrets-vault-core";
import {
  backend,
  shaCache,
  assertValidSlug,
  secretPath,
  SECRETS_PREFIX,
  VAULTS_INDEX_PATH,
  RECOVERY_PATH,
  LEGACY_SECRETS_PATH,
  collectRecipients,
  contentIdentity,
  keyboxExists,
  unlockVaultKey,
  setActiveVaultKey,
  collectVaultRecipients,
  writeKeybox,
  readVaultConfig,
  writeVaultConfig,
  writeDeviceRecord,
  writeMemberRecord,
  buildDeviceRecord,
  buildMemberRecord,
  buildRecoveryRecord,
  writeRecoveryRecord,
  readVaultFile,
  ensureSha,
  parseSecretPath,
  toB64,
  generateVaultKey,
  type SecretEntry,
  type SecretRef,
  type VaultsIndex,
  type SecretVaultRecord,
} from "./secrets-vault-core";
import {
  reencryptSecretsTo,
  reencryptItemsTo,
} from "./secrets-vault-reencrypt";
import { currentVaultScope } from "./vault-persistence";

// ─── Vault index ─────────────────────────────────────────────────────────────

async function readVaultsIndex(): Promise<VaultsIndex> {
  const file = await backend.readFile(VAULTS_INDEX_PATH);
  if (file.sha) shaCache.set(VAULTS_INDEX_PATH, file.sha);
  if (typeof file.content !== "string" || !file.content) {
    return { version: 1, vaults: [] };
  }
  try {
    const parsed = JSON.parse(file.content) as VaultsIndex;
    if (parsed.version !== 1 || !Array.isArray(parsed.vaults)) {
      return { version: 1, vaults: [] };
    }
    return parsed;
  } catch {
    return { version: 1, vaults: [] };
  }
}

async function writeVaultsIndex(index: VaultsIndex, message: string): Promise<void> {
  const result = await backend.writeFile(
    VAULTS_INDEX_PATH,
    JSON.stringify(index, null, 2),
    message,
    shaCache.get(VAULTS_INDEX_PATH),
  );
  shaCache.set(VAULTS_INDEX_PATH, result.sha);
}

export async function listSecretVaults(): Promise<SecretVaultRecord[]> {
  const idx = await readVaultsIndex();
  return idx.vaults.slice().sort((a, b) => a.label.localeCompare(b.label));
}

export async function createSecretVault(slug: string, label: string): Promise<SecretVaultRecord> {
  assertValidSlug(slug);
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Vault label cannot be empty.");
  const idx = await readVaultsIndex();
  if (idx.vaults.some((v) => v.slug === slug)) {
    throw new Error(`A vault with slug "${slug}" already exists.`);
  }
  const record: SecretVaultRecord = {
    slug,
    label: trimmed,
    createdAt: new Date().toISOString(),
  };
  idx.vaults.push(record);
  await writeVaultsIndex(idx, `Create secret vault "${trimmed}"`);
  return record;
}

export async function renameSecretVault(slug: string, newLabel: string): Promise<SecretVaultRecord> {
  const trimmed = newLabel.trim();
  if (!trimmed) throw new Error("Vault label cannot be empty.");
  const idx = await readVaultsIndex();
  const found = idx.vaults.find((v) => v.slug === slug);
  if (!found) throw new Error(`Vault "${slug}" not found.`);
  const oldLabel = found.label;
  found.label = trimmed;
  await writeVaultsIndex(idx, `Rename vault "${oldLabel}" → "${trimmed}"`);
  return found;
}

export async function deleteSecretVault(
  slug: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const idx = await readVaultsIndex();
  const found = idx.vaults.find((v) => v.slug === slug);
  if (!found) return;

  const refs = (await listAllSecrets()).filter((r) => r.vault === slug);
  if (refs.length > 0) {
    if (!opts.force) {
      throw new Error(
        `Vault "${found.label}" still contains ${refs.length} secret(s). Move or remove them first.`,
      );
    }
    for (const ref of refs) {
      const path = secretPath(ref.name, ref.vault);
      await ensureSha(path);
      const sha = shaCache.get(path);
      if (sha) await backend.deleteFile(path, sha, `Remove secret "${ref.name}" (vault deletion)`);
      shaCache.delete(path);
    }
  }

  idx.vaults = idx.vaults.filter((v) => v.slug !== slug);
  await writeVaultsIndex(idx, `Delete secret vault "${found.label}"`);
}

// ─── Secret listing ──────────────────────────────────────────────────────────

export async function isVaultInitialized(): Promise<boolean> {
  const file = await readVaultFile(RECOVERY_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  return typeof file.content === "string" && file.content.length > 0;
}

export interface InitVaultArgs {
  device: DeviceIdentity;
  recoveryRecipient: string;
  encryption?: "required" | "off";
  recoverySigning?: RecoverySigningKey;
  owner?: { memberId: string; displayName?: string; email?: string };
  scheme?: "multi" | "envelope";
}

export async function initVault({
  device,
  recoveryRecipient,
  encryption = "required",
  recoverySigning,
  owner,
  scheme = "multi",
}: InitVaultArgs): Promise<void> {
  const now = new Date().toISOString();
  await writeVaultConfig(
    { version: 1, encryption, ...(scheme === "envelope" ? { scheme } : {}) },
    `Initialize crypto vault: set encryption policy "${encryption}"`,
  );
  await writeRecoveryRecord(
    buildRecoveryRecord(recoveryRecipient, now, recoverySigning),
    "Initialize crypto vault: set recovery key",
  );
  if (owner && recoverySigning) {
    await writeMemberRecord(
      buildMemberRecord(
        {
          memberId: owner.memberId,
          displayName: owner.displayName,
          email: owner.email,
          signingKey: toB64(recoverySigning.publicKey),
          role: "owner",
          addedAt: now,
          addedBy: owner.memberId,
        },
        recoverySigning,
      ),
      `Initialize crypto vault: register owner "${owner.memberId}"`,
    );
  }
  await writeDeviceRecord(
    buildDeviceRecord(
      { deviceId: device.deviceId, name: device.name, recipient: device.recipient, addedAt: now },
      recoverySigning,
      owner?.memberId,
    ),
    `Initialize crypto vault: register device "${device.name}"`,
  );
  if (scheme === "envelope") {
    const vaultKey = await generateVaultKey();
    await writeKeybox(
      vaultKey,
      [device.recipient, recoveryRecipient],
      "Initialize crypto vault: create keybox",
      { epoch: 1, recoverySigning },
    );
    setActiveVaultKey(vaultKey);
  }
}

export async function migrateToEnvelope(
  device: DeviceIdentity,
  recoverySigning?: RecoverySigningKey,
) {
  if (await keyboxExists()) {
    return unlockVaultKey(device);
  }
  const vaultKey = await generateVaultKey();
  const vaultRecipient = vaultKey.recipient;

  await reencryptSecretsTo(
    device.identity,
    vaultRecipient,
    (ref) => `Migrate secret "${ref.vault ? `${ref.vault}/${ref.name}` : ref.name}" to envelope`,
  );
  await reencryptItemsTo(
    device.identity,
    vaultRecipient,
    (kind, id) => `Migrate ${kind} "${id}" to envelope`,
  );

  const recipients = await collectVaultRecipients(device);
  await writeKeybox(vaultKey, recipients, "Migrate: create keybox", {
    epoch: 1,
    recoverySigning,
  });
  const config = await readVaultConfig();
  await writeVaultConfig(
    { ...config, scheme: "envelope" },
    "Migrate: switch to envelope encryption scheme",
  );
  setActiveVaultKey(vaultKey);
  return vaultKey;
}

export async function listSecretNames(vaultSlug = ""): Promise<string[]> {
  const refs = await listAllSecrets();
  return refs
    .filter((r) => r.vault === vaultSlug)
    .map((r) => r.name)
    .sort();
}

export async function listAllSecrets(): Promise<SecretRef[]> {
  const { entries } = await backend.listFiles(SECRETS_PREFIX);
  const refs: SecretRef[] = [];
  for (const e of entries) {
    const ref = parseSecretPath(e.path);
    if (!ref) continue;
    shaCache.set(e.path, e.sha);
    refs.push(ref);
  }
  return refs.sort((a, b) =>
    a.vault === b.vault ? a.name.localeCompare(b.name) : a.vault.localeCompare(b.vault),
  );
}

// ─── Offline-first (SWR) cache for the Secrets list view ─────────────────────
const SECRETS_VIEW_KEY = "@blob:secrets-view";

export interface SecretsViewPayload {
  vaults: SecretVaultRecord[];
  secrets: SecretRef[];
}

export async function cacheSecretsView(payload: SecretsViewPayload): Promise<void> {
  const scope = currentVaultScope();
  if (!scope) return;
  await getSecretsCache().putFile(scope, {
    path: SECRETS_VIEW_KEY,
    sha: "",
    content: JSON.stringify(payload),
  });
}

export async function readCachedSecretsView(): Promise<SecretsViewPayload | null> {
  const scope = currentVaultScope();
  if (!scope) return null;
  const hit = await getSecretsCache().getFile(scope, SECRETS_VIEW_KEY);
  if (!hit || !hit.content) return null;
  try {
    return JSON.parse(hit.content) as SecretsViewPayload;
  } catch {
    return null;
  }
}

// ─── Secret CRUD ─────────────────────────────────────────────────────────────

export async function getSecret(
  name: string,
  device: DeviceIdentity,
  vaultSlug = "",
): Promise<string | null> {
  const path = secretPath(name, vaultSlug);
  const file = await backend.readFile(path);
  if (file.sha) shaCache.set(path, file.sha);
  if (typeof file.content !== "string" || !file.content) return null;
  const json = await decryptSecrets(file.content, contentIdentity(device));
  const entry = JSON.parse(json) as SecretEntry;
  return entry.value;
}

export async function setSecret(
  name: string,
  value: string,
  device: DeviceIdentity,
  vaultSlug = "",
): Promise<void> {
  if (vaultSlug) assertValidSlug(vaultSlug);
  const path = secretPath(name, vaultSlug);
  await ensureSha(path);
  const existed = shaCache.has(path);
  const entry: SecretEntry = { value, updatedAt: new Date().toISOString() };
  const recipients = await collectRecipients(device);
  const armored = await encryptSecrets(JSON.stringify(entry), recipients);
  const label = vaultSlug ? `${vaultSlug}/${name}` : name;
  const result = await backend.writeFile(
    path,
    armored,
    existed ? `Rotate secret "${label}"` : `Set secret "${label}"`,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

export async function removeSecret(
  name: string,
  _device: DeviceIdentity,
  vaultSlug = "",
): Promise<void> {
  const path = secretPath(name, vaultSlug);
  await ensureSha(path);
  const sha = shaCache.get(path);
  if (!sha) return;
  const label = vaultSlug ? `${vaultSlug}/${name}` : name;
  await backend.deleteFile(path, sha, `Remove secret "${label}"`);
  shaCache.delete(path);
}

export async function moveSecret(
  name: string,
  fromVault: string,
  toVault: string,
  device: DeviceIdentity,
): Promise<void> {
  if (fromVault === toVault) return;
  if (toVault) assertValidSlug(toVault);

  const value = await getSecret(name, device, fromVault);
  if (value === null) throw new Error(`Secret "${name}" not found in source vault.`);

  const fromPath = secretPath(name, fromVault);
  const toPath = secretPath(name, toVault);

  await ensureSha(toPath);
  if (shaCache.has(toPath)) {
    throw new Error(
      `A secret named "${name}" already exists in the destination vault.`,
    );
  }

  const entry: SecretEntry = { value, updatedAt: new Date().toISOString() };
  const recipients = await collectRecipients(device);
  const armored = await encryptSecrets(JSON.stringify(entry), recipients);
  const fromLabel = fromVault ? `${fromVault}/${name}` : name;
  const toLabel = toVault ? `${toVault}/${name}` : name;

  const writeResult = await backend.writeFile(
    toPath,
    armored,
    `Move secret "${fromLabel}" → "${toLabel}"`,
    undefined,
  );
  shaCache.set(toPath, writeResult.sha);

  await ensureSha(fromPath);
  const fromSha = shaCache.get(fromPath);
  if (fromSha) {
    await backend.deleteFile(fromPath, fromSha, `Move secret "${fromLabel}" → "${toLabel}"`);
    shaCache.delete(fromPath);
  }
}

export async function restoreSecret(
  name: string,
  commitSha: string,
  device: DeviceIdentity,
  vaultSlug = "",
): Promise<void> {
  const path = secretPath(name, vaultSlug);
  const file = await backend.readFileAtRef(path, commitSha);
  if (typeof file.content !== "string" || !file.content) {
    throw new Error(`Secret "${name}" not found at commit ${commitSha.slice(0, 7)}`);
  }
  const json = await decryptSecrets(file.content, contentIdentity(device));
  const entry = JSON.parse(json) as SecretEntry;
  await setSecret(name, entry.value, device, vaultSlug);
}

export async function migrateFromBlob(device: DeviceIdentity): Promise<boolean> {
  const file = await backend.readFile(LEGACY_SECRETS_PATH);
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
    const result = await backend.writeFile(path, armored, `Migrate secret "${name}"`, undefined);
    shaCache.set(path, result.sha);
  }

  await backend.deleteFile(LEGACY_SECRETS_PATH, file.sha, "Remove legacy secrets.age after migration");
  return true;
}
