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
import * as defaultVaultApi from "./vault-api";
import {
  encryptSecrets,
  decryptSecrets,
  encryptToPassphrase,
  generateSharePassphrase,
} from "./crypto/vault-crypto";
import {
  classifyEncryptedPath,
  encryptItemPayload,
  parseEncryptedEnvelope,
  decryptItemPayload,
  type EncryptedItemKind,
} from "./crypto/item-crypto";
import type { DeviceIdentity } from "./crypto/device-key";
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
import type { NoteKitApi } from "@notekit/api-client";

/**
 * File-level vault operations the secrets module depends on. Browser code
 * gets these from `./vault-api` (cookie auth, the default backend); CLI / MCP
 * inject their own backend that talks to the API via bearer auth. Calling
 * {@link configureSecretsBackend} swaps the active implementation.
 */
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
}

let backend: SecretsBackend = {
  listFiles: defaultVaultApi.listFiles,
  readFile: defaultVaultApi.readFile,
  readFileAtRef: defaultVaultApi.readFileAtRef,
  writeFile: defaultVaultApi.writeFile,
  deleteFile: defaultVaultApi.deleteFile,
};

/** Override the backend that the secrets module uses for vault file I/O. */
export function configureSecretsBackend(custom: SecretsBackend): void {
  backend = custom;
}

/**
 * Wrap a {@link NoteKitApi} client (bearer-auth, used by CLI / MCP / desktop)
 * into the {@link SecretsBackend} shape so it can be passed to
 * {@link configureSecretsBackend}. Browser code uses the default backend and
 * doesn't need this helper.
 */
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
export const MEMBERS_PREFIX = ".notekit/members/";

/** Slug for the unnamed root-level vault. Empty string by design. */
export const DEFAULT_VAULT_SLUG = "";
/** Display label for the Default vault. */
export const DEFAULT_VAULT_LABEL = "Default";

/** Path of the old single-blob format — used only for migration. */
const LEGACY_SECRETS_PATH = ".notekit/secrets.age";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export interface DeviceRecord {
  deviceId: string;
  name: string;
  recipient: string;
  addedAt: string;
  /**
   * The member this device belongs to (first-class membership). In a
   * member-mode vault the record is signed by *this member's* signing key, and
   * the field is verified against the member registry — so a key can't be
   * reattributed to a different member. Absent in single-user vaults.
   */
  owner?: string;
  /**
   * Ed25519 signature (base64) over the device binding. In single-user vaults
   * it's by the recovery signing key; in member-mode by the owner-member's key.
   * Its absence/invalidity drops the record from the recipient set so an
   * injected key never becomes a reader (device-key-resilience §5).
   */
  sig?: string;
}

/**
 * A vault member's trust record (first-class membership). Stored at
 * `.notekit/members/<memberId>.json`, signed by an *owner* signing key so only
 * an owner can admit a member. The member's `signingKey` is their root of trust:
 * their device records are signed by it. See
 * docs/architecture/first-class-membership.md.
 */
export interface MemberRecord {
  memberId: string;
  displayName?: string;
  email?: string;
  /** Base64 Ed25519 signing key — this member's trust root. */
  signingKey: string;
  role: "owner" | "member";
  addedAt: string;
  /** memberId of the owner who admitted them. */
  addedBy?: string;
  /** Signature by an owner signing key (self-signed for the owner record). */
  sig?: string;
}

export type MemberRegistry = Map<string, MemberRecord>;

/**
 * Verify a device record against the member who claims to own it: looks the
 * member up in the registry and checks the signature against *their* signing
 * key. A record naming an unknown member, or signed by a different key, is
 * untrusted — this is what makes attribution unforgeable.
 */
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
  /**
   * Base64 Ed25519 public key — the vault's root of trust. When present the
   * vault is in "signed mode": every device record must carry a valid `sig`
   * from this key. Derived from the recovery mnemonic (see `recovery.ts`).
   */
  signingKey?: string;
  /** Self-signature binding {recipient, signingKey, createdAt} to the root. */
  sig?: string;
}

/** The fields of a device record that the signature covers. */
export type SignedDeviceFields = {
  deviceId: string;
  recipient: string;
  addedAt: string;
  /** Member this device belongs to (first-class membership). */
  owner?: string;
  sig?: string;
};

/**
 * Verify a device record's signature against a given signing key. A record with
 * no/invalid signature is untrusted and must not enter a recipient set. When the
 * record carries an `owner`, that field is bound into the signed payload so it
 * can't be reattributed. Accepts any object with the signed fields (a vault
 * `DeviceRecord`, or a directory entry fetched for another user).
 */
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

/**
 * Vault-level encryption policy, fixed at creation ("born-E2EE"). We never
 * flip a cleartext vault to `required` in place — git history would retain the
 * plaintext forever (see docs/architecture/e2ee-everywhere-and-sharing.md §4).
 *
 *   - `required` — every item (note/ticket/link/journal) is sealed; the
 *     per-item plaintext escape hatch is hidden. The default for new vaults.
 *   - `off`      — legacy per-item opt-in (the historical behaviour). Also the
 *     fallback when `.notekit/config.json` is absent, so an older vault keeps
 *     working unchanged rather than suddenly sealing everything.
 */
export interface VaultConfig {
  version: 1;
  encryption: "required" | "off";
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
  /** Empty string = Default vault. */
  vault: string;
  name: string;
}

interface VaultsIndex {
  version: 1;
  vaults: SecretVaultRecord[];
}

const shaCache = new Map<string, string>();

// ─── Path helpers ────────────────────────────────────────────────────────────

function secretPath(name: string, vaultSlug: string = ""): string {
  return vaultSlug
    ? `${SECRETS_PREFIX}${vaultSlug}/${name}.age`
    : `${SECRETS_PREFIX}${name}.age`;
}

/** Parse a path returned by listFiles into a secret ref, or null if not a secret. */
function parseSecretPath(path: string): SecretRef | null {
  if (!path.startsWith(SECRETS_PREFIX) || !path.endsWith(".age")) return null;
  const rel = path.slice(SECRETS_PREFIX.length, -".age".length);
  if (!rel) return null;
  const slash = rel.indexOf("/");
  if (slash === -1) return { vault: "", name: rel };
  return { vault: rel.slice(0, slash), name: rel.slice(slash + 1) };
}

function devicePath(deviceId: string): string {
  return `${DEVICES_PREFIX}${deviceId}.json`;
}

function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid vault slug "${slug}". Use lowercase letters, digits, and hyphens (1–40 chars, starting with a letter or digit).`,
    );
  }
}

// ─── Device & recovery records ───────────────────────────────────────────────

export async function listDevices(): Promise<DeviceRecord[]> {
  const { entries } = await backend.listFiles(DEVICES_PREFIX);
  const devices: DeviceRecord[] = [];
  for (const e of entries) {
    if (!e.path.endsWith(".json")) continue;
    const file = await backend.readFile(e.path);
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

/** Read the member registry, keyed by memberId. Empty for single-user vaults. */
export async function readMembers(): Promise<MemberRegistry> {
  const map: MemberRegistry = new Map();
  const { entries } = await backend.listFiles(MEMBERS_PREFIX);
  for (const e of entries) {
    if (!e.path.endsWith(".json")) continue;
    const file = await backend.readFile(e.path);
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

function memberPath(memberId: string): string {
  return `${MEMBERS_PREFIX}${memberId}.json`;
}

async function writeMemberRecord(record: MemberRecord, message: string): Promise<void> {
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
  const file = await backend.readFile(RECOVERY_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string") return null;
  let rec: RecoveryRecord;
  try {
    rec = JSON.parse(file.content) as RecoveryRecord;
  } catch {
    return null;
  }
  // Signed mode: the recovery record self-binds its age recipient to its
  // signing key. A present-but-invalid self-signature means the root was
  // tampered with — refuse to treat it as the trust anchor.
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

/**
 * Read the vault encryption policy. Absent or malformed config → `off`
 * (legacy opt-in), so an older vault is never silently switched to sealing.
 */
export async function readVaultConfig(): Promise<VaultConfig> {
  const fallback: VaultConfig = { version: 1, encryption: "off" };
  const file = await backend.readFile(CONFIG_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string" || !file.content) return fallback;
  try {
    const parsed = JSON.parse(file.content) as Partial<VaultConfig>;
    return {
      version: 1,
      encryption: parsed.encryption === "required" ? "required" : "off",
    };
  } catch {
    return fallback;
  }
}

async function writeVaultConfig(config: VaultConfig, message: string) {
  const result = await backend.writeFile(
    CONFIG_PATH,
    JSON.stringify(config, null, 2),
    message,
    shaCache.get(CONFIG_PATH),
  );
  shaCache.set(CONFIG_PATH, result.sha);
}

async function collectRecipients(device: DeviceIdentity): Promise<string[]> {
  return collectVaultRecipients(device);
}

/**
 * Public flavor of {@link collectRecipients} — gather every age recipient
 * that should be able to read newly encrypted data in this vault: each
 * registered device pubkey, the current device's pubkey (in case it's
 * mid-pair and not yet listed under `.notekit/devices/`), and the BIP39
 * recovery pubkey if one exists.
 *
 * Used by sync.ts to seal per-item E2EE files for the same audience that
 * already reads the secrets vault, so a user who's set up encryption for
 * API keys doesn't pick a separate passphrase for encrypted notes.
 */
export async function collectVaultRecipients(
  device: DeviceIdentity,
): Promise<string[]> {
  const [devices, recovery, members] = await Promise.all([
    listDevices(),
    readRecovery(),
    readMembers(),
  ]);
  // Three modes, in order of strength:
  //  - member-mode  (members/* present): each device must be validly signed by
  //    ITS claimed member's key → unforgeable per-member attribution.
  //  - signed-mode  (recovery.json has a signing key): each device must be
  //    signed by the single recovery key.
  //  - legacy       (neither): accept every record, as before.
  // A maliciously injected device pubkey is dropped in the first two.
  const memberMode = members.size > 0;
  const signingKey = recovery?.signingKey;
  const recipients = new Set<string>();
  for (const d of devices) {
    if (memberMode) {
      if (!deviceRecordTrustedByMember(d, members)) {
        console.warn(
          `[crypto] dropping device "${d.deviceId}" — not validly signed by its member "${d.owner ?? "?"}"`,
        );
        continue;
      }
    } else if (signingKey && !deviceRecordTrusted(d, signingKey)) {
      console.warn(
        `[crypto] dropping untrusted device record "${d.deviceId}" — missing/invalid signature`,
      );
      continue;
    }
    recipients.add(d.recipient);
  }
  // The current device is always trusted locally (it's us), even mid-pair
  // before our own signed record has landed.
  recipients.add(device.recipient);
  if (recovery) recipients.add(recovery.recipient);
  return Array.from(recipients);
}

async function ensureSha(path: string): Promise<void> {
  if (shaCache.has(path)) return;
  const file = await backend.readFile(path);
  if (file.sha) shaCache.set(path, file.sha);
}

async function writeDeviceRecord(record: DeviceRecord, message: string) {
  const path = devicePath(record.deviceId);
  const result = await backend.writeFile(
    path,
    JSON.stringify(record, null, 2),
    message,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

async function writeRecoveryRecord(record: RecoveryRecord, message: string) {
  const result = await backend.writeFile(
    RECOVERY_PATH,
    JSON.stringify(record, null, 2),
    message,
    shaCache.get(RECOVERY_PATH),
  );
  shaCache.set(RECOVERY_PATH, result.sha);
}

/**
 * Build a device record, signing it with the recovery key when one is supplied
 * (born-signed vaults). Without a signing key the record is unsigned (legacy
 * vaults) — `collectVaultRecipients` only enforces signatures when the vault's
 * recovery.json advertises a signing key.
 */
function buildDeviceRecord(
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

/** Build a member record, self/owner-signed when a signing key is supplied. */
function buildMemberRecord(
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

/** Build a recovery record, self-signed when a signing key is supplied. */
function buildRecoveryRecord(
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

/** Re-encrypt every existing secret (across all vaults) for an updated recipient list. */
async function reEncryptAll(
  signer: DeviceIdentity,
  recipients: string[],
  commitMessage: (ref: SecretRef) => string,
): Promise<void> {
  const { entries } = await backend.listFiles(SECRETS_PREFIX);
  for (const e of entries) {
    const ref = parseSecretPath(e.path);
    if (!ref) continue;
    const file = await backend.readFile(e.path);
    if (!file.sha || typeof file.content !== "string" || !file.content) continue;
    shaCache.set(e.path, file.sha);
    const json = await decryptSecrets(file.content, signer.identity);
    const armored = await encryptSecrets(json, recipients);
    const result = await backend.writeFile(e.path, armored, commitMessage(ref), file.sha);
    shaCache.set(e.path, result.sha);
  }
}

/**
 * Walk every E2EE note/ticket/link (`<kind>/<id>.md.age`) and re-seal it to
 * the supplied recipient set, preserving the plaintext frontmatter. Used by
 * {@link addDevice} after a new device is registered so that pre-existing
 * encrypted items can be read from that device, and by {@link removeDevice}
 * after a key is revoked so subsequent edits aren't readable by it.
 *
 * Same shape as {@link reEncryptAll} for secrets, scoped to the three item
 * prefixes. Failures on individual files are logged and skipped — a single
 * bad file shouldn't block the rest of the rewrap.
 */
async function reencryptAllItems(
  signer: DeviceIdentity,
  recipients: string[],
  commitMessage: (kind: EncryptedItemKind, id: string) => string,
): Promise<void> {
  const prefixes: ReadonlyArray<{ prefix: string; kind: EncryptedItemKind }> = [
    { prefix: "notes/", kind: "note" },
    { prefix: "tickets/", kind: "ticket" },
    { prefix: "links/", kind: "link" },
  ];
  for (const { prefix } of prefixes) {
    let entries: { path: string; sha: string }[] = [];
    try {
      ({ entries } = await backend.listFiles(prefix));
    } catch (err) {
      console.warn(`[items-rewrap] list ${prefix} failed`, err);
      continue;
    }
    for (const e of entries) {
      const kind = classifyEncryptedPath(e.path);
      if (!kind) continue;
      try {
        const file = await backend.readFile(e.path);
        if (!file.sha || typeof file.content !== "string" || !file.content) continue;
        shaCache.set(e.path, file.sha);
        const env = parseEncryptedEnvelope(file.content);
        if (!env) {
          console.warn(`[items-rewrap] ${e.path} not a valid encrypted envelope, skipping`);
          continue;
        }
        const payload = await decryptItemPayload<unknown>(env.ciphertext, signer.identity);
        const armored = await encryptItemPayload(payload, recipients);
        // Header bytes are deterministic from the public frontmatter, which
        // we preserve verbatim. Only the ciphertext below is replaced.
        const headerEnd = file.content.indexOf("-----BEGIN AGE ENCRYPTED FILE-----");
        const header = headerEnd >= 0 ? file.content.slice(0, headerEnd) : "---\n---\n";
        const next = `${header}${armored}\n`;
        const result = await backend.writeFile(
          e.path,
          next,
          commitMessage(kind, env.fm.id),
          file.sha,
        );
        shaCache.set(e.path, result.sha);
      } catch (err) {
        console.warn(`[items-rewrap] ${e.path} rewrap failed`, err);
      }
    }
  }
}

// ─── Per-item sharing ────────────────────────────────────────────────────────

export const SHARES_PREFIX = ".notekit/shares/";

/** A single grant: one invitee an item has been shared with. */
export interface ShareGrant {
  /** Invitee's account email (how they were looked up in the directory). */
  email: string;
  /** Invitee's recovery signing key — kept so the grant can be re-verified. */
  signingKey: string;
  /** Invitee's verified device recipients the item is sealed to. */
  recipients: string[];
  grantedAt: string;
}

/**
 * The shared-recipients record for one item, committed to
 * `.notekit/shares/{kind}-{id}.json`. This is the **persistent source of
 * truth** for an item's extra recipients — sync consults it on every re-seal
 * via {@link recipientsForItem}, so editing a shared note doesn't silently
 * drop the people it was shared with. Recipients are public keys, so the
 * manifest is cleartext (it does leak *which* items are shared with whom).
 */
export interface ShareManifest {
  version: 1;
  kind: EncryptedItemKind;
  id: string;
  shares: ShareGrant[];
}

function sharePath(kind: EncryptedItemKind, id: string): string {
  return `${SHARES_PREFIX}${kind}-${id}.json`;
}

function itemPrefix(kind: EncryptedItemKind): string {
  return kind === "note" ? "notes/" : kind === "ticket" ? "tickets/" : "links/";
}

export async function readShareManifest(
  kind: EncryptedItemKind,
  id: string,
): Promise<ShareManifest | null> {
  const file = await backend.readFile(sharePath(kind, id));
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string" || !file.content) return null;
  try {
    return JSON.parse(file.content) as ShareManifest;
  } catch {
    return null;
  }
}

async function writeShareManifest(m: ShareManifest, message: string): Promise<void> {
  const path = sharePath(m.kind, m.id);
  const result = await backend.writeFile(
    path,
    JSON.stringify(m, null, 2),
    message,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

/** Recipients an item is shared with, beyond the vault's own devices. */
export async function extraRecipientsForItem(
  kind: EncryptedItemKind,
  id: string,
): Promise<string[]> {
  const m = await readShareManifest(kind, id);
  if (!m) return [];
  const set = new Set<string>();
  for (const g of m.shares) for (const r of g.recipients) set.add(r);
  return Array.from(set);
}

/**
 * Full recipient set for sealing a specific item: the vault's own recipients
 * plus anyone the item is shared with. Sync uses this (not the bare
 * {@link collectVaultRecipients}) so shared items keep their invitees.
 */
export async function recipientsForItem(
  kind: EncryptedItemKind,
  id: string,
  device: DeviceIdentity,
): Promise<string[]> {
  const [base, extra] = await Promise.all([
    collectVaultRecipients(device),
    extraRecipientsForItem(kind, id),
  ]);
  return Array.from(new Set([...base, ...extra]));
}

/** Re-seal a single encrypted item to a new recipient set. */
async function reencryptItem(
  kind: EncryptedItemKind,
  id: string,
  signer: DeviceIdentity,
  recipients: string[],
  message: string,
): Promise<boolean> {
  const { entries } = await backend.listFiles(itemPrefix(kind));
  for (const e of entries) {
    if (classifyEncryptedPath(e.path) !== kind) continue;
    const file = await backend.readFile(e.path);
    if (!file.sha || typeof file.content !== "string" || !file.content) continue;
    const env = parseEncryptedEnvelope(file.content);
    if (!env || env.fm.id !== id) continue;
    const payload = await decryptItemPayload<unknown>(env.ciphertext, signer.identity);
    const armored = await encryptItemPayload(payload, recipients);
    const headerEnd = file.content.indexOf("-----BEGIN AGE ENCRYPTED FILE-----");
    const header = headerEnd >= 0 ? file.content.slice(0, headerEnd) : "---\n---\n";
    const result = await backend.writeFile(e.path, `${header}${armored}\n`, message, file.sha);
    shaCache.set(e.path, result.sha);
    return true;
  }
  return false;
}

/**
 * Share an item with an already-verified invitee: record the grant in the
 * item's share manifest and re-encrypt the item to include their recipients.
 * The caller must have verified the invitee's keys (via
 * `directory.fetchVerifiedKeys`) — this function trusts the passed recipients.
 *
 * Repo *read* access is a separate concern handled by the collaborator-invite
 * flow; this only manages the E2EE recipient set.
 */
export async function shareItemWith(
  kind: EncryptedItemKind,
  id: string,
  grant: { email: string; signingKey: string; recipients: string[] },
  signer: DeviceIdentity,
): Promise<void> {
  const now = new Date().toISOString();
  const existing =
    (await readShareManifest(kind, id)) ??
    ({ version: 1, kind, id, shares: [] } as ShareManifest);
  // Replace any prior grant to the same email (re-share with refreshed keys).
  const shares = existing.shares.filter((s) => s.email !== grant.email);
  shares.push({ ...grant, grantedAt: now });
  await writeShareManifest(
    { version: 1, kind, id, shares },
    `Share ${kind} "${id}" with ${grant.email}`,
  );
  const recipients = await recipientsForItem(kind, id, signer);
  await reencryptItem(
    kind,
    id,
    signer,
    recipients,
    `Re-encrypt ${kind} "${id}" for share with ${grant.email}`,
  );
}

export interface PassphraseShare {
  /** The generated passphrase — deliver out-of-band, never via the same channel. */
  passphrase: string;
  /** ASCII-armored age file the recipient decrypts with the passphrase. */
  armored: string;
}

/**
 * Produce a passphrase-encrypted copy of an item for someone with no NoteKit
 * account. Decrypts the item with this device, then re-encrypts the payload to
 * a freshly generated passphrase (age scrypt). The recipient decrypts with any
 * age client; the server never sees plaintext. Returns null if the item isn't
 * found. This is a point-in-time snapshot — it does not update on edits.
 */
export async function createPassphraseShare(
  kind: EncryptedItemKind,
  id: string,
  signer: DeviceIdentity,
): Promise<PassphraseShare | null> {
  const { entries } = await backend.listFiles(itemPrefix(kind));
  for (const e of entries) {
    if (classifyEncryptedPath(e.path) !== kind) continue;
    const file = await backend.readFile(e.path);
    if (typeof file.content !== "string" || !file.content) continue;
    const env = parseEncryptedEnvelope(file.content);
    if (!env || env.fm.id !== id) continue;
    const payload = await decryptItemPayload<unknown>(env.ciphertext, signer.identity);
    const passphrase = generateSharePassphrase();
    const armored = await encryptToPassphrase(JSON.stringify(payload), passphrase);
    return { passphrase, armored };
  }
  return null;
}

/** Who an item is currently shared with (empty if never shared). */
export async function listItemShares(
  kind: EncryptedItemKind,
  id: string,
): Promise<ShareGrant[]> {
  return (await readShareManifest(kind, id))?.shares ?? [];
}

/**
 * Revoke an invitee from an item: drop their grant and re-encrypt the item to
 * the reduced set. **Forward-only** — Git can't claw back history, so the
 * revoked user can still decrypt versions they already pulled. New versions
 * exclude them. Returns false if they weren't shared with. Callers should
 * surface the forward-only caveat in the UI.
 */
export async function unshareItemWith(
  kind: EncryptedItemKind,
  id: string,
  email: string,
  signer: DeviceIdentity,
): Promise<boolean> {
  const manifest = await readShareManifest(kind, id);
  if (!manifest) return false;
  const shares = manifest.shares.filter((s) => s.email !== email);
  if (shares.length === manifest.shares.length) return false; // not shared with them
  await writeShareManifest(
    { version: 1, kind, id, shares },
    `Revoke ${email} from ${kind} "${id}"`,
  );
  const recipients = await recipientsForItem(kind, id, signer);
  await reencryptItem(
    kind,
    id,
    signer,
    recipients,
    `Re-encrypt ${kind} "${id}" after revoking ${email}`,
  );
  return true;
}

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

/**
 * Return all named secret vaults registered in the index, sorted by label.
 * The Default vault is implicit and not included.
 */
export async function listSecretVaults(): Promise<SecretVaultRecord[]> {
  const idx = await readVaultsIndex();
  return idx.vaults.slice().sort((a, b) => a.label.localeCompare(b.label));
}

/** Create a new named secret vault. Throws if the slug already exists. */
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

/** Rename a vault's display label. Slug (folder) stays the same. */
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

/**
 * Delete a named vault. By default the vault must be empty; pass
 * `{ force: true }` to remove any remaining secrets first.
 */
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
  const file = await backend.readFile(RECOVERY_PATH);
  if (file.sha) shaCache.set(file.path, file.sha);
  return typeof file.content === "string" && file.content.length > 0;
}

export interface InitVaultArgs {
  device: DeviceIdentity;
  recoveryRecipient: string;
  /**
   * Encryption policy to stamp on the vault at birth. Defaults to `required`
   * (E2EE-everywhere) — the policy is fixed here and never changed in place.
   */
  encryption?: "required" | "off";
  /**
   * Recovery signing key (Ed25519) to make this a "signed mode" vault: the
   * recovery record advertises its public signing key and the bootstrap device
   * record is signed by it. Omit only to create a legacy unsigned vault.
   */
  recoverySigning?: RecoverySigningKey;
  /**
   * The vault owner's account identity — when provided (with `recoverySigning`),
   * the vault is "born with membership": the owner is written as the first
   * member (`.notekit/members/<memberId>.json`, role `owner`) and the bootstrap
   * device is attributed to them. Omit for a plain single-user vault.
   */
  owner?: { memberId: string; displayName?: string; email?: string };
}

export async function initVault({
  device,
  recoveryRecipient,
  encryption = "required",
  recoverySigning,
  owner,
}: InitVaultArgs): Promise<void> {
  const now = new Date().toISOString();
  await writeVaultConfig(
    { version: 1, encryption },
    `Initialize crypto vault: set encryption policy "${encryption}"`,
  );
  await writeRecoveryRecord(
    buildRecoveryRecord(recoveryRecipient, now, recoverySigning),
    "Initialize crypto vault: set recovery key",
  );
  // Born-with-membership: record the owner as member #0, signing key = the
  // recovery signing key. Their devices are attributed to them.
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
}

/**
 * List secret names within a specific vault. Pass an empty string (the
 * default) for the Default/root vault. Returns sorted names.
 */
export async function listSecretNames(vaultSlug: string = ""): Promise<string[]> {
  const refs = await listAllSecrets();
  return refs
    .filter((r) => r.vault === vaultSlug)
    .map((r) => r.name)
    .sort();
}

/** List every secret across every vault, including Default. */
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

// ─── Secret CRUD ─────────────────────────────────────────────────────────────

export async function getSecret(
  name: string,
  device: DeviceIdentity,
  vaultSlug: string = "",
): Promise<string | null> {
  const path = secretPath(name, vaultSlug);
  const file = await backend.readFile(path);
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
  vaultSlug: string = "",
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
  vaultSlug: string = "",
): Promise<void> {
  const path = secretPath(name, vaultSlug);
  await ensureSha(path);
  const sha = shaCache.get(path);
  if (!sha) return;
  const label = vaultSlug ? `${vaultSlug}/${name}` : name;
  await backend.deleteFile(path, sha, `Remove secret "${label}"`);
  shaCache.delete(path);
}

/**
 * Move a secret to a different vault (or to/from Default). Re-encrypts under
 * a new path and deletes the old one. Both vault arguments are slugs; "" =
 * Default.
 */
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

  // Refuse to overwrite an existing secret with the same name at the destination.
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

export async function addDevice(
  newDevice: { deviceId: string; name: string; recipient: string },
  signer: DeviceIdentity,
  recoverySigning?: RecoverySigningKey,
): Promise<void> {
  const now = new Date().toISOString();
  // In a signed-mode vault the new record must carry a recovery signature, or
  // `collectVaultRecipients` would just drop it again. Approving therefore
  // requires the recovery signing key (held by the origin device, or supplied
  // by entering the recovery phrase on a secondary device).
  const recovery = await readRecovery();
  if (recovery?.signingKey && !recoverySigning) {
    throw new Error(
      "This vault requires the recovery phrase to approve a new device (it signs the device record).",
    );
  }
  // In a member-mode vault, attribute the new device to the member whose
  // signing key is approving it (so it's owned by the right person, not just
  // "a device"). Falls back to no owner for plain signed/legacy vaults.
  let owner: string | undefined;
  if (recoverySigning) {
    const members = await readMembers();
    const signerKeyB64 = toB64(recoverySigning.publicKey);
    for (const m of members.values()) {
      if (m.signingKey === signerKeyB64) { owner = m.memberId; break; }
    }
  }
  await writeDeviceRecord(
    buildDeviceRecord(
      { deviceId: newDevice.deviceId, name: newDevice.name, recipient: newDevice.recipient, addedAt: now },
      recoverySigning,
      owner,
    ),
    `Add device "${newDevice.name}"`,
  );
  const recipients = await collectRecipients(signer);
  await reEncryptAll(
    signer,
    recipients,
    (r) => {
      const label = r.vault ? `${r.vault}/${r.name}` : r.name;
      return `Re-encrypt secret "${label}" for device "${newDevice.name}"`;
    },
  );
  // Re-encrypt every E2EE note/ticket/link to the new recipient set as well,
  // so the newly-paired device can read items that already exist. Without
  // this the new device sees `.md.age` files it can't decrypt and the
  // encryptedSkipped banner trips. Failures here don't undo the device add
  // (the secret re-encryption already succeeded), but they do surface so
  // the operator can investigate.
  await reencryptAllItems(
    signer,
    recipients,
    (kind, id) =>
      `Re-encrypt ${kind} "${id}" for device "${newDevice.name}"`,
  );
}

export async function removeDevice(
  deviceId: string,
  signer: DeviceIdentity,
): Promise<void> {
  const path = devicePath(deviceId);
  const file = await backend.readFile(path);
  if (!file.sha) return;
  let removedName = deviceId;
  if (typeof file.content === "string") {
    try { removedName = (JSON.parse(file.content) as DeviceRecord).name ?? deviceId; } catch { /* keep id */ }
  }
  await backend.deleteFile(path, file.sha, `Revoke device "${removedName}"`);
  shaCache.delete(path);
  const recipients = await collectRecipients(signer);
  await reEncryptAll(
    signer,
    recipients,
    (r) => {
      const label = r.vault ? `${r.vault}/${r.name}` : r.name;
      return `Re-encrypt secret "${label}" after revoking "${removedName}"`;
    },
  );
  // Items get the same treatment so a revoked device can no longer
  // decrypt newly-pushed history (it could already cache older ciphertext
  // it had access to, but the next change shouldn't be readable).
  await reencryptAllItems(
    signer,
    recipients,
    (kind, id) =>
      `Re-encrypt ${kind} "${id}" after revoking "${removedName}"`,
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
  vaultSlug: string = "",
): Promise<void> {
  const path = secretPath(name, vaultSlug);
  const file = await backend.readFileAtRef(path, commitSha);
  if (typeof file.content !== "string" || !file.content) {
    throw new Error(`Secret "${name}" not found at commit ${commitSha.slice(0, 7)}`);
  }
  const json = await decryptSecrets(file.content, device.identity);
  const entry = JSON.parse(json) as SecretEntry;
  await setSecret(name, entry.value, device, vaultSlug);
}

/**
 * One-time migration: if the legacy single-blob `.notekit/secrets.age` exists,
 * split it into per-secret files then delete the blob. Migrated secrets land
 * in the Default vault (root of `.notekit/secrets/`).
 * Returns true if migration ran, false if there was nothing to migrate.
 */
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
