/**
 * Envelope ("lockbox") encryption — the vault key and its keybox.
 *
 * Instead of sealing every content file to every device (O(N) re-encrypt on
 * device-add), content is sealed ONCE to a single random **vault key** V. V's
 * private identity is then age-encrypted to every trusted device (+ recovery)
 * in one small file, `.notekit/keybox.age`. Adding a device only rewrites that
 * one file — content is never touched. See
 * docs/personal/architecture/envelope-encryption.md.
 *
 * This module is pure crypto: it never touches the git backend. Reading/writing
 * `keybox.age` and signing/verifying it against the recovery root live in
 * secrets-vault.ts (which owns `backend` and the trust store), mirroring how
 * vault-crypto.ts stays IO-free.
 */
import { generateIdentity, identityToRecipient } from "age-encryption";
import { encryptSecrets, decryptSecrets } from "./vault-crypto";

/** The vault's single content key: content is sealed to `recipient`, opened with `identity`. */
export interface VaultKey {
  /** age secret key (`AGE-SECRET-KEY-1…`) — decrypts all content. */
  identity: string;
  /** age recipient (`age1…`) — the sole recipient every content file is sealed to. */
  recipient: string;
}

/** Decrypted keybox payload. `sig` (signed-mode) is verified by the caller. */
export interface KeyboxPayload {
  v: 1;
  /** Bumped when the vault key is rotated (device removal). Lets a stale device re-unlock. */
  epoch: number;
  vaultKey: VaultKey;
  /**
   * Signature over {v, epoch, recipient}; verified by the caller. In legacy
   * signed mode it is the recovery (master) key's signature. In Model B it is an
   * in-roster DEVICE's signature, and {@link signedBy} names which device signing
   * pubkey produced it (checked against the current roster) — so the master key
   * stays cold on device add/revoke.
   */
  sig?: string;
  /** Model B: base64 device signing pubkey that produced `sig`. */
  signedBy?: string;
}

/** A fresh random vault key. Called once at vault init (or on rotation). */
export async function generateVaultKey(): Promise<VaultKey> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

/**
 * Deterministic bytes the recovery key signs over, binding the keybox to the
 * vault's signing root so a repo-writer can't swap in a keybox for an attacker
 * key. The signature covers epoch + content recipient (not the secret identity,
 * which the verifier never sees in plaintext). Mirrors deviceSigningPayload.
 */
export function keyboxSigningPayload(fields: {
  epoch: number;
  recipient: string;
}): Uint8Array {
  return new TextEncoder().encode(
    `notekit-keybox\nv=1\nepoch=${fields.epoch}\nrecipient=${fields.recipient}`,
  );
}

/**
 * Seal the vault key into an armored keybox, encrypted to every trusted
 * recipient (all devices + recovery). `sig`, when supplied, is embedded as-is —
 * this module does not compute it (the caller signs with the recovery key).
 */
export async function sealKeybox(
  vaultKey: VaultKey,
  recipients: string[],
  opts: { epoch?: number; sig?: string; signedBy?: string } = {},
): Promise<string> {
  const payload: KeyboxPayload = {
    v: 1,
    epoch: opts.epoch ?? 1,
    vaultKey,
    ...(opts.sig ? { sig: opts.sig } : {}),
    ...(opts.signedBy ? { signedBy: opts.signedBy } : {}),
  };
  return encryptSecrets(JSON.stringify(payload), recipients);
}

/**
 * Open a keybox with a device identity, returning the vault key + metadata.
 * Throws on a malformed payload. Does NOT verify `sig` — the caller checks it
 * against the pinned recovery signing key (via trust-store) before use.
 */
export async function openKeybox(
  armored: string,
  deviceIdentity: string,
): Promise<KeyboxPayload> {
  const json = await decryptSecrets(armored, deviceIdentity);
  const parsed = JSON.parse(json) as Partial<KeyboxPayload>;
  const vk = parsed.vaultKey;
  if (
    parsed.v !== 1 ||
    typeof parsed.epoch !== "number" ||
    !vk ||
    typeof vk.identity !== "string" ||
    typeof vk.recipient !== "string"
  ) {
    throw new Error("keybox: malformed payload");
  }
  // Re-derive the recipient from the identity so a tampered `recipient` field
  // can't redirect content sealing to an attacker while still opening here.
  const derived = await identityToRecipient(vk.identity);
  if (derived !== vk.recipient) {
    throw new Error("keybox: recipient does not match identity");
  }
  return {
    v: 1,
    epoch: parsed.epoch,
    vaultKey: { identity: vk.identity, recipient: vk.recipient },
    ...(typeof parsed.sig === "string" ? { sig: parsed.sig } : {}),
    ...(typeof parsed.signedBy === "string" ? { signedBy: parsed.signedBy } : {}),
  };
}
