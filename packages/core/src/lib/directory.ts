/**
 * Client side of the cross-user public-key directory (see routes/directory.ts).
 *
 * - {@link publishMyKeys} pushes this user's recovery signing key + signed
 *   device records to the directory so others can encrypt to them.
 * - {@link fetchVerifiedKeys} looks another user up by email and — crucially —
 *   **verifies every returned device record against their published signing
 *   key** before handing back any recipient. The server is untrusted here: it
 *   could return forged device records, so an unverified recipient must never
 *   reach an encryption set. The signing key itself is verified out-of-band by
 *   the caller via its safety number (`fingerprint.ts`).
 */
import { apiFetch } from "./api";
import {
  addMember,
  createPassphraseShare,
  deviceRecordTrusted,
  ensureOwnerMember,
  listDevices,
  readRecovery,
  removeMember,
  shareItemWith,
  unshareItemWith,
  type PassphraseShare,
  type SignedDeviceFields,
} from "./secrets-vault";
import { useCryptoStore } from "../stores/cryptoStore";
import type { EncryptedItemKind } from "./crypto/item-crypto";
import type { RecoverySigningKey } from "./crypto/recovery";
import { deriveFingerprint, formatFingerprint } from "./crypto/fingerprint";

interface DirectoryDevice {
  deviceId: string;
  name?: string | null;
  recipient: string;
  addedAt: string;
  owner?: string | null;
  sig?: string | null;
}

interface DirectoryResponse {
  email: string;
  signingKey: string;
  devices: DirectoryDevice[];
}

/**
 * A verified device record from the directory, ready to copy into a vault when
 * admitting the owner as a member. Carries the member's own signature, so it
 * stays trustworthy after the copy.
 */
export interface VerifiedDirectoryDevice {
  deviceId: string;
  name?: string;
  recipient: string;
  addedAt: string;
  owner?: string;
  sig?: string;
}

/** Another user's keys, after verification. Only trusted recipients survive. */
export interface VerifiedDirectoryKeys {
  email: string;
  /** The user's recovery signing key — verify via safety number before trust. */
  signingKey: string;
  /** age recipients of device records that carry a valid recovery signature. */
  recipients: string[];
  /**
   * The full verified device records (not just recipients) — needed to admit
   * the user as a member, where the owner copies these verbatim into the vault.
   */
  devices: VerifiedDirectoryDevice[];
  /** How many records the server returned that FAILED verification (forged?). */
  rejected: number;
}

/**
 * Publish this device's view of the vault's public keys. Safe to call from any
 * device — the signing key and device records are all public. No-op for a
 * legacy (unsigned) vault, which has nothing verifiable to publish.
 */
export async function publishMyKeys(): Promise<boolean> {
  const recovery = await readRecovery();
  if (!recovery?.signingKey) return false; // not a signed-mode vault
  const devices = await listDevices();
  await apiFetch("/directory/keys", {
    method: "PUT",
    body: JSON.stringify({
      signingKey: recovery.signingKey,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        recipient: d.recipient,
        addedAt: d.addedAt,
        owner: d.owner,
        sig: d.sig,
      })),
    }),
  });
  return true;
}

/**
 * Look up another user's keys and return only the recipients whose device
 * record is validly signed by their advertised signing key. Returns null if
 * the user has published nothing (404).
 */
export async function fetchVerifiedKeys(
  email: string,
): Promise<VerifiedDirectoryKeys | null> {
  let res: DirectoryResponse;
  try {
    res = await apiFetch<DirectoryResponse>(
      `/directory/keys?email=${encodeURIComponent(email)}`,
    );
  } catch (e) {
    // 404 → no such user / nothing published. Surface other errors.
    if (isNotFound(e)) return null;
    throw e;
  }

  const recipients: string[] = [];
  const verifiedDevices: VerifiedDirectoryDevice[] = [];
  let rejected = 0;
  for (const d of res.devices) {
    const record: SignedDeviceFields = {
      deviceId: d.deviceId,
      recipient: d.recipient,
      addedAt: d.addedAt,
      owner: d.owner ?? undefined,
      sig: d.sig ?? undefined,
    };
    if (deviceRecordTrusted(record, res.signingKey)) {
      recipients.push(d.recipient);
      verifiedDevices.push({
        deviceId: d.deviceId,
        name: d.name ?? undefined,
        recipient: d.recipient,
        addedAt: d.addedAt,
        owner: d.owner ?? undefined,
        sig: d.sig ?? undefined,
      });
    } else {
      rejected++;
      console.warn(
        `[directory] rejecting unverified device "${d.deviceId}" for ${email} — forged or stale signature`,
      );
    }
  }

  return {
    email: res.email,
    signingKey: res.signingKey,
    recipients,
    devices: verifiedDevices,
    rejected,
  };
}

export interface SharePreview {
  email: string;
  signingKey: string;
  /** Verified device recipients the item would be sealed to. */
  recipientCount: number;
  /** Directory entries that failed signature verification (ignored). */
  rejected: number;
  /**
   * Emoji safety number of the invitee's signing key. The user compares it,
   * out-of-band, against what the invitee sees as their own safety number
   * ({@link mySafetyNumber}) — defeating a server that substitutes the key.
   */
  safetyNumber: string;
}

/**
 * Look up + verify an invitee and return a preview (incl. their safety number)
 * WITHOUT sharing yet, so the UI/agent can prompt for out-of-band verification
 * before committing. Returns null if the user published nothing.
 */
export async function previewShare(email: string): Promise<SharePreview | null> {
  const verified = await fetchVerifiedKeys(email);
  if (!verified) return null;
  const slots = await deriveFingerprint(verified.signingKey);
  return {
    email: verified.email,
    signingKey: verified.signingKey,
    recipientCount: verified.recipients.length,
    rejected: verified.rejected,
    safetyNumber: formatFingerprint(slots),
  };
}

/**
 * This vault's own safety number — the fingerprint of our recovery signing key.
 * Show it so a collaborator can confirm they're sharing with the real you.
 * Returns null for a legacy (unsigned) vault.
 */
export async function mySafetyNumber(): Promise<string | null> {
  const recovery = await readRecovery();
  if (!recovery?.signingKey) return null;
  return formatFingerprint(await deriveFingerprint(recovery.signingKey));
}

export interface ShareResult {
  /** false when the invitee has no account / published no verifiable keys. */
  shared: boolean;
  /** Number of the invitee's verified device recipients the item now seals to. */
  recipients: number;
  /** Records the directory returned that failed verification (ignored). */
  rejected: number;
  reason?: "not_found" | "no_verified_keys" | "no_identity";
}

/**
 * Share an item with another user by email: look them up, verify their keys,
 * and (only if at least one verified recipient remains) record the grant and
 * re-encrypt the item to include them. Repo read access is granted separately
 * via the collaborator invite.
 */
export async function shareItem(
  kind: EncryptedItemKind,
  id: string,
  email: string,
): Promise<ShareResult> {
  const verified = await fetchVerifiedKeys(email);
  if (!verified) {
    return { shared: false, recipients: 0, rejected: 0, reason: "not_found" };
  }
  if (verified.recipients.length === 0) {
    return {
      shared: false,
      recipients: 0,
      rejected: verified.rejected,
      reason: "no_verified_keys",
    };
  }
  const device = useCryptoStore.getState().device;
  if (!device) {
    return { shared: false, recipients: 0, rejected: verified.rejected, reason: "no_identity" };
  }
  await shareItemWith(
    kind,
    id,
    {
      email: verified.email,
      signingKey: verified.signingKey,
      recipients: verified.recipients,
    },
    device,
  );
  return { shared: true, recipients: verified.recipients.length, rejected: verified.rejected };
}

export interface AdmitResult {
  admitted: boolean;
  /** memberId of the admitted member (their email). */
  memberId: string;
  email: string;
  /** Verified device records pulled into the vault. */
  devicesAdded: number;
  /** Records that failed to verify on copy (skipped). */
  devicesSkipped: number;
  /** Directory records the server returned that failed verification. */
  rejected: number;
  reason?: "not_found" | "no_verified_keys" | "no_identity" | "no_devices";
}

/**
 * Admit another user as a first-class member of this vault (membership Pt 2b).
 *
 * Mirrors WhatsApp's "admin admits a member", one-sided: the directory is the
 * keyserver. The owner must have **verified the invitee's safety number**
 * out-of-band first ({@link previewShare}) — this is the commit step after that
 * check, analogous to {@link shareItem} after a preview.
 *
 * Looks the invitee up, copies their self-signed device records into the vault
 * (the owner only vouches for their signing key — it can't forge their
 * devices), and re-encrypts everything to the widened recipient set. Requires
 * the owner's recovery signing key, which signs the member record.
 *
 * `owner` is this account's own identity (memberId = email), used to register
 * the owner as a member on first admission so member-mode doesn't drop the
 * owner's own devices ({@link ensureOwnerMember}).
 */
export async function admitMember(
  email: string,
  ownerSigning: RecoverySigningKey,
  owner: { memberId: string; displayName?: string; email?: string },
): Promise<AdmitResult> {
  const lookup = email.trim().toLowerCase();
  const verified = await fetchVerifiedKeys(lookup);
  if (!verified) {
    return { admitted: false, memberId: lookup, email: lookup, devicesAdded: 0, devicesSkipped: 0, rejected: 0, reason: "not_found" };
  }
  if (verified.recipients.length === 0) {
    return { admitted: false, memberId: lookup, email: lookup, devicesAdded: 0, devicesSkipped: 0, rejected: verified.rejected, reason: "no_verified_keys" };
  }
  const device = useCryptoStore.getState().device;
  if (!device) {
    return { admitted: false, memberId: lookup, email: lookup, devicesAdded: 0, devicesSkipped: 0, rejected: verified.rejected, reason: "no_identity" };
  }
  // Only the invitee's member-tagged devices (owner === their memberId) can be
  // copied in — a record published without an owner can't be attributed and so
  // can't be admitted (the invitee must be on a born-membership build).
  const memberDevices = verified.devices.filter((d) => d.owner === lookup);
  if (memberDevices.length === 0) {
    return { admitted: false, memberId: lookup, email: lookup, devicesAdded: 0, devicesSkipped: 0, rejected: verified.rejected, reason: "no_devices" };
  }
  // Register the owner as a member first (idempotent) so member-mode keeps the
  // owner's own devices, then admit the invitee.
  await ensureOwnerMember(owner, ownerSigning);
  const { devicesAdded, devicesSkipped } = await addMember(
    {
      memberId: lookup,
      displayName: verified.email,
      email: verified.email,
      signingKey: verified.signingKey,
    },
    memberDevices,
    device,
    ownerSigning,
  );
  return {
    admitted: devicesAdded > 0,
    memberId: lookup,
    email: verified.email,
    devicesAdded,
    devicesSkipped,
    rejected: verified.rejected,
  };
}

/**
 * Revoke a member from this vault (forward-only — see {@link removeMember}).
 * Repo collaborator access is removed separately.
 */
export async function revokeMember(memberId: string): Promise<boolean> {
  const device = useCryptoStore.getState().device;
  if (!device) return false;
  await removeMember(memberId, device);
  return true;
}

/**
 * Create a passphrase-encrypted snapshot of an item to share with someone who
 * has no NoteKit account (phase 5). Returns the passphrase + armored blob to
 * deliver out-of-band, or null if the item isn't found / no identity.
 */
export async function createShareLink(
  kind: EncryptedItemKind,
  id: string,
): Promise<PassphraseShare | null> {
  const device = useCryptoStore.getState().device;
  if (!device) return null;
  return createPassphraseShare(kind, id, device);
}

/**
 * Revoke an invitee from an item (forward-only — see {@link unshareItemWith}).
 * Returns false if they weren't shared with or this device has no identity.
 */
export async function unshareItem(
  kind: EncryptedItemKind,
  id: string,
  email: string,
): Promise<boolean> {
  const device = useCryptoStore.getState().device;
  if (!device) return false;
  return unshareItemWith(kind, id, email, device);
}

export function isNotFound(e: unknown): boolean {
  // NoteKitApiError carries a numeric status; fall back to a string match.
  const status = (e as { status?: number })?.status;
  if (status === 404) return true;
  return /\b404\b|not_found/.test((e as Error)?.message ?? "");
}
