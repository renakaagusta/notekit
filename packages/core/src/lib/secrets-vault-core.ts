/**
 * Core state, I/O primitives, and low-level vault operations shared by all
 * secrets-vault modules. Import from here (never from secrets-vault.ts) to
 * avoid circular dependencies.
 *
 * Public API is re-exported from secrets-vault.ts — external callers should
 * import from "@notekit/core/secrets" as usual.
 */
import type { NoteKitApi } from "@notekit/api-client";
import type { StoragePort } from "../application/ports/out/StoragePort";
import type { DeviceIdentity } from "./crypto/device-key";
import {
  type VaultKey,
  generateVaultKey,
  sealKeybox,
  openKeybox,
  keyboxSigningPayload,
  sealAuthorityGrant,
  openAuthorityGrant,
} from "./crypto/keybox";
import type { RecoverySigningKey } from "./crypto/recovery";
import {
  deviceSigningPayload,
  memberSigningPayload,
  recoverySigningPayload,
  sign,
  verify,
  toB64,
  fromB64,
} from "./crypto/signing";
import {
  encryptSecrets,
  decryptSecrets,
} from "./crypto/vault-crypto";
import { currentVaultScope } from "./vault-persistence";

export interface SecretsBackend {
  listFiles(prefix: string): Promise<{ entries: { path: string; sha: string }[] }>;
  readFile(path: string): Promise<{ path: string; content: string | null; sha: string | null }>;
  readFileAtRef(
    path: string,
    ref: string,
  ): Promise<{ path: string; content: string | null; sha: string | null }>;
  writeFile(
    path: string,
    content: string,
    message: string,
    sha?: string,
  ): Promise<{ path: string; sha: string }>;
  deleteFile(path: string, sha: string, message?: string): Promise<{ ok: true }>;
  commitFiles?(
    files: { path: string; content: string }[],
    message?: string,
  ): Promise<{ commitSha: string }>;
}

let backendRef: SecretsBackend | null = null;

/**
 * The vault I/O backend, injected by the composition root. Every app surface
 * (browser via composition/secrets-browser, CLI/MCP at their entry) must call
 * {@link configureSecretsBackend} before any secret operation runs — there is
 * no default, so a missing wiring fails fast instead of silently using the
 * wrong transport.
 */
export const backend: SecretsBackend = new Proxy({} as SecretsBackend, {
  get(_t, prop) {
    if (!backendRef) throw new Error("secrets backend used before configureSecretsBackend");
    return backendRef[prop as keyof SecretsBackend];
  },
});

export function configureSecretsBackend(custom: SecretsBackend): void {
  backendRef = custom;
}

let fileCacheRef: StoragePort | null = null;

/** The injected ciphertext cache. Throws if used before configuration. */
function fileCache(): StoragePort {
  if (!fileCacheRef) throw new Error("secrets cache used before configureSecretsCache");
  return fileCacheRef;
}

/** Sibling secrets modules share the one injected cache through this accessor. */
export function getSecretsCache(): StoragePort {
  return fileCache();
}

/**
 * Bind the local ciphertext cache. Browser surfaces inject the IndexedDB cache;
 * CLI/MCP inject {@link noopSecretsCache}. No default — every surface wires one.
 */
export function configureSecretsCache(cache: StoragePort): void {
  fileCacheRef = cache;
}

/**
 * A cache that stores nothing — for surfaces (CLI, MCP) that run one command
 * per process and always read fresh, so there is nothing to persist.
 */
export const noopSecretsCache: StoragePort = {
  getScopeFiles: async () => new Map(),
  getFile: async () => null,
  putFile: async () => undefined,
  removeFile: async () => undefined,
  pruneScope: async () => undefined,
};

// ─── In-bootstrap read coalescing ────────────────────────────────────────────
interface VaultFileResult { path: string; content: string | null; sha: string | null }
let vaultReadMemo: Map<string, Promise<VaultFileResult>> | null = null;
let vaultPreferCache = false;
let vaultWindowServedCache = false;

export function beginVaultReadWindow(opts?: { preferCache?: boolean }): void {
  vaultReadMemo = new Map();
  vaultPreferCache = opts?.preferCache ?? false;
  vaultWindowServedCache = false;
}
export function endVaultReadWindow(): void {
  vaultReadMemo = null;
  vaultPreferCache = false;
}
export function vaultReadServedFromCache(): boolean {
  return vaultWindowServedCache;
}

async function readVaultFileFresh(path: string): Promise<VaultFileResult> {
  const scope = currentVaultScope();
  if (vaultPreferCache && scope) {
    const hit = await fileCache().getFile(scope, path);
    if (hit) {
      vaultWindowServedCache = true;
      return { path, sha: hit.sha || null, content: hit.content };
    }
  }
  try {
    const f = await backend.readFile(path);
    if (scope && f.sha && typeof f.content === "string") {
      void fileCache().putFile(scope, { path, sha: f.sha, content: f.content });
    }
    return f;
  } catch (err) {
    if (scope) {
      const hit = await fileCache().getFile(scope, path);
      if (hit) {
        vaultWindowServedCache = true;
        return { path, sha: hit.sha || null, content: hit.content };
      }
    }
    throw err;
  }
}

export function readVaultFile(path: string): Promise<VaultFileResult> {
  if (!vaultReadMemo) return readVaultFileFresh(path);
  const inflight = vaultReadMemo.get(path);
  if (inflight) return inflight;
  const p = readVaultFileFresh(path);
  vaultReadMemo.set(path, p);
  return p;
}

export async function readVaultListing(
  prefix: string,
): Promise<{ entries: { path: string; sha: string }[] }> {
  const scope = currentVaultScope();
  const cacheKey = `@list:${prefix}`;
  const fromCache = async (): Promise<{ entries: { path: string; sha: string }[] } | null> => {
    if (!scope) return null;
    const hit = await fileCache().getFile(scope, cacheKey);
    if (hit?.content) {
      try {
        return { entries: JSON.parse(hit.content) as { path: string; sha: string }[] };
      } catch {
        /* ignore */
      }
    }
    return null;
  };
  if (vaultPreferCache) {
    const cached = await fromCache();
    if (cached) {
      vaultWindowServedCache = true;
      return cached;
    }
  }
  try {
    const res = await backend.listFiles(prefix);
    if (scope) {
      void fileCache().putFile(scope, { path: cacheKey, sha: "", content: JSON.stringify(res.entries) });
    }
    return res;
  } catch (err) {
    const cached = await fromCache();
    if (cached) {
      vaultWindowServedCache = true;
      return cached;
    }
    throw err;
  }
}

export function prefetchBootstrapFiles(): void {
  if (!vaultReadMemo) return;
  void readVaultFile(RECOVERY_PATH).catch(() => { /* real caller handles/rejects */ });
  void readVaultFile(CONFIG_PATH).catch(() => { /* idem */ });
  void readVaultFile(KEYBOX_PATH).catch(() => { /* idem */ });
}

export function secretsBackendFromApi(nk: NoteKitApi): SecretsBackend {
  return {
    listFiles: (prefix) => nk.vault.listFiles(prefix),
    readFile: (path) => nk.vault.readFile(path),
    readFileAtRef: (path, ref) => nk.vault.readFileAtRef(path, ref),
    writeFile: (path, content, message, sha) =>
      nk.vault.writeFile(path, content, message ?? "", sha),
    deleteFile: (path, sha, message) => nk.vault.deleteFile(path, sha, message),
  };
}

export const DEVICES_PREFIX = ".notekit/devices/";
export const RECOVERY_PATH = ".notekit/recovery.json";
export const SECRETS_PREFIX = ".notekit/secrets/";
export const VAULTS_INDEX_PATH = ".notekit/secrets/_vaults.json";
export const CONFIG_PATH = ".notekit/config.json";
export const KEYBOX_PATH = ".notekit/keybox.age";
export const MEMBERS_PREFIX = ".notekit/members/";
export const AUTHORITY_PREFIX = ".notekit/authority/";
export const DEFAULT_VAULT_SLUG = "";
export const DEFAULT_VAULT_LABEL = "Default";
export const SHARES_PREFIX = ".notekit/shares/";

const LEGACY_SECRETS_PATH = ".notekit/secrets.age";
export { LEGACY_SECRETS_PATH };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface DeviceRecord {
  deviceId: string;
  name: string;
  recipient: string;
  addedAt: string;
  owner?: string;
  sig?: string;
}

export interface MemberRecord {
  memberId: string;
  displayName?: string;
  email?: string;
  signingKey: string;
  role: "owner" | "member";
  addedAt: string;
  addedBy?: string;
  sig?: string;
}

export type MemberRegistry = Map<string, MemberRecord>;

export function deviceRecordTrustedByMember(
  d: SignedDeviceFields,
  members: MemberRegistry,
): boolean {
  if (!d.sig || !d.owner) return false;
  const member = members.get(d.owner);
  if (!member) return false;
  return deviceRecordTrusted(d, member.signingKey);
}

export interface RecoveryRecord {
  recipient: string;
  createdAt: string;
  signingKey?: string;
  sig?: string;
}

export interface SignedDeviceFields {
  deviceId: string;
  recipient: string;
  addedAt: string;
  owner?: string;
  sig?: string;
}

export function deviceRecordTrusted(
  d: SignedDeviceFields,
  signingKeyB64: string,
): boolean {
  if (!d.sig) return false;
  return verify(
    deviceSigningPayload({
      deviceId: d.deviceId,
      recipient: d.recipient,
      addedAt: d.addedAt,
      owner: d.owner,
    }),
    d.sig,
    fromB64(signingKeyB64),
  );
}

export interface VaultConfig {
  version: 1;
  encryption: "required" | "off";
  scheme?: "multi" | "envelope";
}

export interface SecretEntry {
  value: string;
  updatedAt: string;
}

export interface SecretVaultRecord {
  slug: string;
  label: string;
  createdAt: string;
}

export interface SecretRef {
  vault: string;
  name: string;
}

export interface VaultsIndex {
  version: 1;
  vaults: SecretVaultRecord[];
}

export const shaCache = new Map<string, string>();

// ─── Path helpers ────────────────────────────────────────────────────────────

export function secretPath(name: string, vaultSlug = ""): string {
  return vaultSlug
    ? `${SECRETS_PREFIX}${vaultSlug}/${name}.age`
    : `${SECRETS_PREFIX}${name}.age`;
}

export function parseSecretPath(path: string): SecretRef | null {
  if (!path.startsWith(SECRETS_PREFIX) || !path.endsWith(".age")) return null;
  const rel = path.slice(SECRETS_PREFIX.length, -".age".length);
  if (!rel) return null;
  const slash = rel.indexOf("/");
  if (slash === -1) return { vault: "", name: rel };
  return { vault: rel.slice(0, slash), name: rel.slice(slash + 1) };
}

export function devicePath(deviceId: string): string {
  return `${DEVICES_PREFIX}${deviceId}.json`;
}

export function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid vault slug "${slug}". Use lowercase letters, digits, and hyphens (1–40 chars, starting with a letter or digit).`,
    );
  }
}

export function memberPath(memberId: string): string {
  return `${MEMBERS_PREFIX}${memberId}.json`;
}

export function authorityGrantPath(deviceId: string): string {
  return `${AUTHORITY_PREFIX}${deviceId}.age`;
}

export function sharePath(kind: string, id: string): string {
  return `${SHARES_PREFIX}${kind}-${id}.json`;
}

export function itemPrefix(kind: string): string {
  return kind === "note" ? "notes/" : kind === "ticket" ? "tickets/" : "links/";
}

export function recipientSignature(recipients: string[]): string {
  return [...recipients].sort().join(",");
}

export interface BatchFile { path: string; content: string; message?: string }

export async function commitMany(files: BatchFile[], batchMessage: string): Promise<void> {
  if (files.length === 0) return;
  if (backend.commitFiles) {
    await backend.commitFiles(
      files.map((f) => ({ path: f.path, content: f.content })),
      batchMessage,
    );
    for (const f of files) shaCache.delete(f.path);
    return;
  }
  for (const f of files) {
    const result = await backend.writeFile(f.path, f.content, f.message ?? batchMessage, shaCache.get(f.path));
    shaCache.set(f.path, result.sha);
  }
}

// ─── Device & recovery records ───────────────────────────────────────────────

export async function listDevices(): Promise<DeviceRecord[]> {
  const { entries } = await readVaultListing(DEVICES_PREFIX);
  const files = await Promise.all(
    entries.filter((e) => e.path.endsWith(".json")).map((e) => readVaultFile(e.path)),
  );
  const devices: DeviceRecord[] = [];
  for (const file of files) {
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

export async function readMembers(): Promise<MemberRegistry> {
  const map: MemberRegistry = new Map();
  const { entries } = await readVaultListing(MEMBERS_PREFIX);
  const files = await Promise.all(
    entries.filter((e) => e.path.endsWith(".json")).map((e) => readVaultFile(e.path)),
  );
  for (const file of files) {
    if (file.sha) shaCache.set(file.path, file.sha);
    if (typeof file.content !== "string") continue;
    try {
      const m = JSON.parse(file.content) as MemberRecord;
      if (m.memberId && m.signingKey) map.set(m.memberId, m);
    } catch {
      // ignore malformed
    }
  }
  return map;
}

export async function writeMemberRecord(record: MemberRecord, message: string): Promise<void> {
  const path = memberPath(record.memberId);
  const result = await backend.writeFile(
    path,
    JSON.stringify(record, null, 2),
    message,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

export async function readRecovery(): Promise<RecoveryRecord | null> {
  const file = await readVaultFile(RECOVERY_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string") return null;
  let rec: RecoveryRecord;
  try {
    rec = JSON.parse(file.content) as RecoveryRecord;
  } catch {
    return null;
  }
  if (rec.signingKey) {
    const ok =
      !!rec.sig &&
      verify(
        recoverySigningPayload({
          recipient: rec.recipient,
          signingKey: rec.signingKey,
          createdAt: rec.createdAt,
        }),
        rec.sig,
        fromB64(rec.signingKey),
      );
    if (!ok) {
      throw new Error(
        "Recovery record signature is invalid — the vault's trust root may have been tampered with.",
      );
    }
  }
  return rec;
}

export async function readVaultConfig(): Promise<VaultConfig> {
  const fallback: VaultConfig = { version: 1, encryption: "off" };
  const file = await readVaultFile(CONFIG_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string" || !file.content) return fallback;
  try {
    const parsed = JSON.parse(file.content) as Partial<VaultConfig>;
    return {
      version: 1,
      encryption: parsed.encryption === "required" ? "required" : "off",
      ...(parsed.scheme === "envelope" ? { scheme: "envelope" as const } : {}),
    };
  } catch {
    return fallback;
  }
}

export async function writeVaultConfig(config: VaultConfig, message: string) {
  const result = await backend.writeFile(
    CONFIG_PATH,
    JSON.stringify(config, null, 2),
    message,
    shaCache.get(CONFIG_PATH),
  );
  shaCache.set(CONFIG_PATH, result.sha);
}

// ─── Keybox IO (envelope mode) ───────────────────────────────────────────────

async function readKeyboxArmored(): Promise<string | null> {
  const file = await readVaultFile(KEYBOX_PATH);
  if (file.sha) shaCache.set(KEYBOX_PATH, file.sha);
  return typeof file.content === "string" && file.content ? file.content : null;
}

export async function keyboxExists(): Promise<boolean> {
  return (await readKeyboxArmored()) !== null;
}

export async function unlockVaultKey(
  device: DeviceIdentity,
  recoveryIdentity?: string,
): Promise<VaultKey | null> {
  const armored = await readKeyboxArmored();
  if (!armored) return null;
  let payload;
  try {
    payload = await openKeybox(armored, device.identity);
  } catch (err) {
    if (!recoveryIdentity) throw err;
    payload = await openKeybox(armored, recoveryIdentity);
  }
  const recovery = await readRecovery();
  if (recovery?.signingKey) {
    if (!payload.sig) {
      throw new Error("keybox: missing signature in a signed-mode vault");
    }
    const ok = verify(
      keyboxSigningPayload({
        epoch: payload.epoch,
        recipient: payload.vaultKey.recipient,
      }),
      payload.sig,
      fromB64(recovery.signingKey),
    );
    if (!ok) {
      throw new Error("keybox: signature does not match the vault recovery key");
    }
  }
  return payload.vaultKey;
}

export async function writeKeybox(
  vaultKey: VaultKey,
  recipients: string[],
  message: string,
  opts: { epoch?: number; recoverySigning?: RecoverySigningKey } = {},
): Promise<void> {
  const epoch = opts.epoch ?? 1;
  const sig = opts.recoverySigning
    ? sign(
        keyboxSigningPayload({ epoch, recipient: vaultKey.recipient }),
        opts.recoverySigning.privateKey,
      )
    : undefined;
  const armored = await sealKeybox(vaultKey, recipients, { epoch, sig });
  const result = await backend.writeFile(
    KEYBOX_PATH,
    armored,
    message,
    shaCache.get(KEYBOX_PATH),
  );
  shaCache.set(KEYBOX_PATH, result.sha);
}

/**
 * Seal the recovery signing key to a newly-approved OWNER device so it becomes a
 * full authority (can enrol further devices phrase-free). Written only by a
 * device that already holds the signing key; see the design doc.
 */
export async function writeAuthorityGrant(
  recoverySigning: RecoverySigningKey,
  deviceRecipient: string,
  deviceId: string,
  message: string,
): Promise<void> {
  const armored = await sealAuthorityGrant(recoverySigning, deviceRecipient);
  const path = authorityGrantPath(deviceId);
  const result = await backend.writeFile(path, armored, message, shaCache.get(path));
  shaCache.set(path, result.sha);
}

/**
 * Load this device's authority grant, if any. Returns the recovery signing key
 * ONLY when its derived public key matches the vault's pinned recovery signing
 * key — a mismatched/forged grant is rejected (fail-closed), so it can never be
 * used to sign records that a verifier would then reject anyway. Absent grant or
 * legacy vault (no recovery signing key) → null.
 */
export async function loadAuthorityGrant(
  device: DeviceIdentity,
): Promise<RecoverySigningKey | null> {
  const recovery = await readRecovery();
  if (!recovery?.signingKey) return null;
  const file = await readVaultFile(authorityGrantPath(device.deviceId));
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string" || !file.content) return null;
  const signing = await openAuthorityGrant(file.content, device.identity);
  if (toB64(signing.publicKey) !== recovery.signingKey) {
    throw new Error(
      "authority grant: signing key does not match the vault recovery key",
    );
  }
  return signing;
}

export async function readKeyboxEpoch(
  device: DeviceIdentity,
  recoveryIdentity?: string,
): Promise<number | null> {
  const armored = await readKeyboxArmored();
  if (!armored) return null;
  for (const id of [device.identity, recoveryIdentity].filter(Boolean) as string[]) {
    try {
      return (await openKeybox(armored, id)).epoch;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function addSelfToKeybox(
  device: DeviceIdentity,
  recoveryIdentity: string,
  recoverySigning?: RecoverySigningKey,
): Promise<VaultKey | null> {
  const vaultKey = await unlockVaultKey(device, recoveryIdentity);
  if (!vaultKey) return null;
  const recovery = await readRecovery();
  const canSign =
    !recovery?.signingKey ||
    (recoverySigning &&
      toB64(recoverySigning.publicKey) === recovery.signingKey);
  if (!canSign) return vaultKey;
  const epoch = (await readKeyboxEpoch(device, recoveryIdentity)) ?? 1;
  const recipients = await collectVaultRecipients(device);
  await writeKeybox(
    vaultKey,
    recipients,
    `Add device "${device.name}" to keybox`,
    { epoch, recoverySigning },
  );
  return vaultKey;
}

export async function collectRecipients(device: DeviceIdentity): Promise<string[]> {
  return contentRecipients(device);
}

// ─── Envelope (lockbox) content-crypto seam ──────────────────────────────────
let activeVaultKey: VaultKey | null = null;

export function setActiveVaultKey(vaultKey: VaultKey | null): void {
  activeVaultKey = vaultKey;
}

export function getActiveVaultKey(): VaultKey | null {
  return activeVaultKey;
}

export async function contentRecipients(device: DeviceIdentity): Promise<string[]> {
  if (activeVaultKey) return [activeVaultKey.recipient];
  return collectVaultRecipients(device);
}

export function contentIdentity(device: DeviceIdentity): string {
  return activeVaultKey ? activeVaultKey.identity : device.identity;
}

// ─── Reusable vault-content crypto + backend ─────────────────────────────────

export async function encryptVaultContent(
  json: string,
  device: DeviceIdentity,
): Promise<string> {
  return encryptSecrets(json, await contentRecipients(device));
}

export async function encryptVaultContentMany(
  jsons: string[],
  device: DeviceIdentity,
): Promise<string[]> {
  const recipients = await contentRecipients(device);
  return Promise.all(jsons.map((j) => encryptSecrets(j, recipients)));
}

export async function decryptVaultContent(
  content: string,
  device: DeviceIdentity,
): Promise<string> {
  return decryptSecrets(content, contentIdentity(device));
}

export function getVaultBackend(): SecretsBackend {
  return backend;
}

export async function collectVaultRecipients(
  device: DeviceIdentity,
): Promise<string[]> {
  const [devices, recovery, members] = await Promise.all([
    listDevices(),
    readRecovery(),
    readMembers(),
  ]);
  const memberMode = members.size > 0;
  const signingKey = recovery?.signingKey;
  const recipients = new Set<string>();
  for (const d of devices) {
    if (memberMode) {
      if (!deviceRecordTrustedByMember(d, members)) {
        continue;
      }
    } else if (signingKey && !deviceRecordTrusted(d, signingKey)) {
      continue;
    }
    recipients.add(d.recipient);
  }
  recipients.add(device.recipient);
  if (recovery) recipients.add(recovery.recipient);
  return Array.from(recipients);
}

export async function ensureSha(path: string): Promise<void> {
  if (shaCache.has(path)) return;
  const file = await backend.readFile(path);
  if (file.sha) shaCache.set(path, file.sha);
}

export async function writeDeviceRecord(record: DeviceRecord, message: string) {
  const path = devicePath(record.deviceId);
  const result = await backend.writeFile(
    path,
    JSON.stringify(record, null, 2),
    message,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

export async function writeRecoveryRecord(record: RecoveryRecord, message: string) {
  const result = await backend.writeFile(
    RECOVERY_PATH,
    JSON.stringify(record, null, 2),
    message,
    shaCache.get(RECOVERY_PATH),
  );
  shaCache.set(RECOVERY_PATH, result.sha);
}

export function buildDeviceRecord(
  fields: { deviceId: string; name: string; recipient: string; addedAt: string },
  signing?: RecoverySigningKey,
  owner?: string,
): DeviceRecord {
  const base: DeviceRecord = owner ? { ...fields, owner } : { ...fields };
  if (!signing) return base;
  return {
    ...base,
    sig: sign(
      deviceSigningPayload({
        deviceId: fields.deviceId,
        recipient: fields.recipient,
        addedAt: fields.addedAt,
        owner,
      }),
      signing.privateKey,
    ),
  };
}

export function buildMemberRecord(
  fields: {
    memberId: string;
    displayName?: string;
    email?: string;
    signingKey: string;
    role: "owner" | "member";
    addedAt: string;
    addedBy?: string;
  },
  ownerSigning?: RecoverySigningKey,
): MemberRecord {
  if (!ownerSigning) return { ...fields };
  return {
    ...fields,
    sig: sign(
      memberSigningPayload({
        memberId: fields.memberId,
        signingKey: fields.signingKey,
        role: fields.role,
        addedAt: fields.addedAt,
      }),
      ownerSigning.privateKey,
    ),
  };
}

export function buildRecoveryRecord(
  recipient: string,
  createdAt: string,
  signing?: RecoverySigningKey,
): RecoveryRecord {
  if (!signing) return { recipient, createdAt };
  const signingKey = toB64(signing.publicKey);
  return {
    recipient,
    createdAt,
    signingKey,
    sig: sign(
      recoverySigningPayload({ recipient, signingKey, createdAt }),
      signing.privateKey,
    ),
  };
}

export { generateVaultKey, toB64, fromB64, encryptSecrets, decryptSecrets };
