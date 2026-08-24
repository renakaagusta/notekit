/**
 * Recipient-record signing — the defence against key-substitution.
 *
 * The vault's recovery key (Ed25519, derived from the BIP39 mnemonic — see
 * `recovery.ts`) is the root of trust. Every device record committed to
 * `.notekit/devices/` is signed by it, and `recovery.json` self-binds its age
 * recipient to its signing key. Clients verify these signatures before adding
 * a recipient to an encryption set, so a malicious writer (a compromised
 * server holding the git token, a rogue collaborator) cannot inject its own
 * pubkey as a "device" and silently become a reader.
 *
 * See docs/architecture/device-key-resilience.md §5 and
 * docs/architecture/e2ee-everywhere-and-sharing.md §5.
 */
import { ed25519 } from "@noble/curves/ed25519.js";
import { base64 } from "@scure/base";

/** Encode an Ed25519 key or signature for JSON storage. */
export function toB64(bytes: Uint8Array): string {
  return base64.encode(bytes);
}

export function fromB64(s: string): Uint8Array {
  return base64.decode(s);
}

/**
 * Canonical bytes signed for a device record. We deliberately sign only the
 * security-critical binding (deviceId ↔ recipient pubkey, plus when it was
 * added) and NOT the cosmetic `name`, so a rename never invalidates the
 * signature. The leading domain tag prevents a device signature from ever
 * validating as a recovery signature or vice-versa.
 */
export function deviceSigningPayload(fields: {
  deviceId: string;
  recipient: string;
  addedAt: string;
  /**
   * The member this device belongs to (first-class membership). When present,
   * it's bound into the signature (v2 payload) so the `owner` field can't be
   * swapped to attribute the key to a different member. Absent → legacy v1
   * payload, so existing single-user device records still verify.
   */
  owner?: string;
}): Uint8Array {
  const canonical = fields.owner
    ? `nk-device-v2\n${fields.deviceId}\n${fields.recipient}\n${fields.addedAt}\n${fields.owner}`
    : `nk-device-v1\n${fields.deviceId}\n${fields.recipient}\n${fields.addedAt}`;
  return new TextEncoder().encode(canonical);
}

/**
 * Canonical bytes signed over a device roster version (Model B).
 *
 * The signature covers the security-critical shape of every entry — the device
 * identity, its signing pubkey, and its encryption recipient — plus the
 * monotonically increasing `version`, so a signer can't be replayed onto a
 * different roster or a rolled-back version. The signer's own `signPub` is bound
 * too so the chain link is explicit and can't be reattributed. Cosmetic fields
 * (`name`, `vouchedBy`) are deliberately excluded so a rename never breaks the
 * signature; `addedAt` IS included because it's part of each entry's identity.
 *
 * Entries are serialized in a canonical order (sorted by deviceId) so the bytes
 * are independent of array ordering — two devices building the same roster
 * produce identical bytes.
 */
export function rosterSigningPayload(fields: {
  version: number;
  signerSignPub: string;
  entries: { deviceId: string; signPub: string; recipient: string; addedAt: string }[];
}): Uint8Array {
  const sorted = [...fields.entries].sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  const lines = sorted.map(
    (e) => `${e.deviceId}\t${e.signPub}\t${e.recipient}\t${e.addedAt}`,
  );
  const canonical = [
    "nk-roster-v1",
    `version=${fields.version}`,
    `signer=${fields.signerSignPub}`,
    ...lines,
  ].join("\n");
  return new TextEncoder().encode(canonical);
}

/** Canonical bytes for recovery.json's self-signature. */
export function recoverySigningPayload(fields: {
  recipient: string;
  signingKey: string;
  createdAt: string;
}): Uint8Array {
  const canonical = `nk-recovery-v1\n${fields.recipient}\n${fields.signingKey}\n${fields.createdAt}`;
  return new TextEncoder().encode(canonical);
}

/**
 * Canonical bytes for a member record's signature — signed by an *owner* signing
 * key, so only an owner can admit a member and the admission is tamper-evident.
 */
export function memberSigningPayload(fields: {
  memberId: string;
  signingKey: string;
  role: string;
  addedAt: string;
}): Uint8Array {
  const canonical = `nk-member-v1\n${fields.memberId}\n${fields.signingKey}\n${fields.role}\n${fields.addedAt}`;
  return new TextEncoder().encode(canonical);
}

/** Sign arbitrary bytes with an Ed25519 private scalar; returns base64. */
export function sign(payload: Uint8Array, privateKey: Uint8Array): string {
  return toB64(ed25519.sign(payload, privateKey));
}

/**
 * Verify a base64 signature over `payload` against an Ed25519 public key.
 * Never throws — a malformed signature/key is just `false`, so a forged or
 * truncated record is rejected rather than crashing the read path.
 */
export function verify(
  payload: Uint8Array,
  signatureB64: string,
  publicKey: Uint8Array,
): boolean {
  try {
    return ed25519.verify(fromB64(signatureB64), payload, publicKey);
  } catch {
    return false;
  }
}
