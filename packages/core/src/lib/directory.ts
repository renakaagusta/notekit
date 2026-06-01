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
  deviceRecordTrusted,
  listDevices,
  readRecovery,
  shareItemWith,
  unshareItemWith,
  type SignedDeviceFields,
} from "./secrets-vault";
import { useCryptoStore } from "../stores/cryptoStore";
import type { EncryptedItemKind } from "./crypto/item-crypto";
import { deriveFingerprint, formatFingerprint } from "./crypto/fingerprint";

interface DirectoryDevice {
  deviceId: string;
  recipient: string;
  addedAt: string;
  sig?: string | null;
}

interface DirectoryResponse {
  email: string;
  signingKey: string;
  devices: DirectoryDevice[];
}

/** Another user's keys, after verification. Only trusted recipients survive. */
export interface VerifiedDirectoryKeys {
  email: string;
  /** The user's recovery signing key — verify via safety number before trust. */
  signingKey: string;
  /** age recipients of device records that carry a valid recovery signature. */
  recipients: string[];
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
        recipient: d.recipient,
        addedAt: d.addedAt,
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
  let rejected = 0;
  for (const d of res.devices) {
    const record: SignedDeviceFields = {
      deviceId: d.deviceId,
      recipient: d.recipient,
      addedAt: d.addedAt,
      sig: d.sig ?? undefined,
    };
    if (deviceRecordTrusted(record, res.signingKey)) {
      recipients.push(d.recipient);
    } else {
      rejected++;
      console.warn(
        `[directory] rejecting unverified device "${d.deviceId}" for ${email} — forged or stale signature`,
      );
    }
  }

  return { email: res.email, signingKey: res.signingKey, recipients, rejected };
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
