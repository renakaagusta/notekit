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
  type SignedDeviceFields,
} from "./secrets-vault";

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

export function isNotFound(e: unknown): boolean {
  // NoteKitApiError carries a numeric status; fall back to a string match.
  const status = (e as { status?: number })?.status;
  if (status === 404) return true;
  return /\b404\b|not_found/.test((e as Error)?.message ?? "");
}
