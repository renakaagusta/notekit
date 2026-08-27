/**
 * Device roster — the Model B trust document (pure crypto, no IO).
 *
 * A roster lists every trusted device: `{ deviceId, name, signPub, recipient,
 * addedAt, vouchedBy }`. Authenticity comes from a CHAIN, verified against the
 * git version history (see "don't reinvent Git" — we do NOT keep a parallel
 * log):
 *
 *   - The GENESIS roster (version 1) is signed by the vault's recovery (master)
 *     Ed25519 signing key, the TOFU-pinned root of trust.
 *   - Every LATER version is signed by a device whose `signPub` is present in
 *     the IMMEDIATELY PRIOR version. So any already-trusted, unlocked device can
 *     add or revoke a device by re-signing — the master key stays cold, used
 *     only at genesis and full recovery.
 *
 * Trust rule (fail-closed): a device is trusted IFF its `signPub` is in the
 * current valid roster AND the whole version sequence validates back to the
 * pinned master key. Anything that doesn't chain is rejected — there is no
 * fallback that weakens verification.
 *
 * The master (recovery) signing private key is NEVER placed in a roster or on
 * any device; only its PUBLIC key is pinned. Each device's signing PRIVATE key
 * never leaves that device. This module only ever handles public keys and
 * signatures.
 */
import type { DeviceKind } from "../../domain/device-kind";
import { rosterSigningPayload, sign, verify, fromB64 } from "./signing";

/** One trusted device in the roster. All public — safe to commit to git. */
export interface RosterEntry {
  deviceId: string;
  /** Cosmetic label; NOT covered by the signature so a rename is free. */
  name: string;
  /** Ed25519 public signing key (base64) — the device's Model B identity. */
  signPub: string;
  /** age recipient (`age1…`) the vault key is wrapped to for this device. */
  recipient: string;
  addedAt: string;
  /** Coarse runtime category for the devices-list icon. Cosmetic, NOT signed. */
  kind?: DeviceKind;
  /**
   * `signPub` of whoever admitted this entry — the master key at genesis, or an
   * in-roster device afterwards. Audit metadata; NOT covered by the signature
   * (git author already attributes the commit — don't reinvent it).
   */
  vouchedBy: string;
}

/**
 * A single roster version as committed to the vault. Git history is the version
 * log; `version` is the monotonically increasing counter the signature binds so
 * a rollback to an older version is detectable.
 */
export interface RosterDocument {
  v: 1;
  version: number;
  entries: RosterEntry[];
  /** `signPub` of the key that signed THIS version (master or an in-roster device). */
  signedBy: string;
  /** Ed25519 signature (base64) over {@link rosterSigningPayload}. */
  sig: string;
}

/** Deterministic bytes the roster signer signs over. */
function payloadFor(doc: {
  version: number;
  signedBy: string;
  entries: RosterEntry[];
}): Uint8Array {
  return rosterSigningPayload({
    version: doc.version,
    signerSignPub: doc.signedBy,
    entries: doc.entries.map((e) => ({
      deviceId: e.deviceId,
      signPub: e.signPub,
      recipient: e.recipient,
      addedAt: e.addedAt,
    })),
  });
}

/**
 * Build and sign a roster version. `signerSignPub`/`signerSignPriv` are the
 * signing keypair of whoever authors it — the master key for genesis, or an
 * in-roster device thereafter.
 */
export function signRoster(
  fields: { version: number; entries: RosterEntry[] },
  signer: { signPub: string; signPriv: Uint8Array },
): RosterDocument {
  const base = { version: fields.version, signedBy: signer.signPub, entries: fields.entries };
  return { v: 1, ...base, sig: sign(payloadFor(base), signer.signPriv) };
}

/** True if `doc` is a structurally valid roster document. Never throws. */
export function isRosterDocument(value: unknown): value is RosterDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<RosterDocument>;
  if (doc.v !== 1 || typeof doc.version !== "number" || !Array.isArray(doc.entries)) {
    return false;
  }
  if (typeof doc.signedBy !== "string" || typeof doc.sig !== "string") return false;
  return doc.entries.every(
    (e) =>
      e &&
      typeof e.deviceId === "string" &&
      typeof e.signPub === "string" &&
      typeof e.recipient === "string" &&
      typeof e.addedAt === "string",
  );
}

/** Verify a single version's self-signature against its declared `signedBy`. */
function selfSignatureValid(doc: RosterDocument): boolean {
  return verify(payloadFor(doc), doc.sig, fromB64(doc.signedBy));
}

export class RosterChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterChainError";
  }
}

/**
 * Verify an ordered chain of roster versions against the pinned master signing
 * key and return the CURRENT (last) roster. Fail-closed: throws on any break.
 *
 * @param versions  roster documents oldest→newest (git history order)
 * @param masterSignPub  the TOFU-pinned recovery signing public key (base64)
 *
 * Rules enforced:
 *  - genesis (first version) MUST be signed by the master key;
 *  - each later version MUST be signed by a `signPub` present in the PRIOR
 *    version's entries (an already-trusted device) — OR by the master key
 *    (full-recovery re-vouch, when all devices are lost);
 *  - `version` numbers MUST be strictly increasing (no rollback/replay);
 *  - every version's self-signature MUST verify.
 */
export function verifyRosterChain(
  versions: RosterDocument[],
  masterSignPub: string,
): RosterDocument {
  const genesis = versions[0];
  if (!genesis) {
    throw new RosterChainError("empty roster chain");
  }
  if (!selfSignatureValid(genesis)) {
    throw new RosterChainError("genesis roster signature is invalid");
  }
  if (genesis.signedBy !== masterSignPub) {
    throw new RosterChainError("genesis roster is not signed by the pinned master key");
  }
  let prior = genesis;
  for (const next of versions.slice(1)) {
    if (next.version <= prior.version) {
      throw new RosterChainError("roster version did not increase (possible rollback)");
    }
    if (!selfSignatureValid(next)) {
      throw new RosterChainError(`roster version ${next.version} signature is invalid`);
    }
    const signerInPrior = prior.entries.some((e) => e.signPub === next.signedBy);
    const signerIsMaster = next.signedBy === masterSignPub;
    if (!signerInPrior && !signerIsMaster) {
      throw new RosterChainError(
        `roster version ${next.version} signed by a key not trusted in the prior version`,
      );
    }
    prior = next;
  }
  return prior;
}

/** True if `signPub` is a trusted device in the given (already-verified) roster. */
export function rosterTrusts(roster: RosterDocument, signPub: string): boolean {
  return roster.entries.some((e) => e.signPub === signPub);
}

/** age recipients of every device in the roster (for wrapping the vault key). */
export function rosterRecipients(roster: RosterDocument): string[] {
  return roster.entries.map((e) => e.recipient);
}
