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
}): Uint8Array {
  const canonical = `nk-device-v1\n${fields.deviceId}\n${fields.recipient}\n${fields.addedAt}`;
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
