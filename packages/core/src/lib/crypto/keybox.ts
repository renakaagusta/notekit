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
import { ed25519 } from "@noble/curves/ed25519.js";
import { base64 } from "@scure/base";
import { generateIdentity, identityToRecipient } from "age-encryption";
import type { RecoverySigningKey } from "./recovery";
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
  /** Optional recovery-key signature over {v, epoch, recipient}; verified by the caller. */
  sig?: string;
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
  opts: { epoch?: number; sig?: string } = {},
): Promise<string> {
  const payload: KeyboxPayload = {
    v: 1,
    epoch: opts.epoch ?? 1,
    vaultKey,
    ...(opts.sig ? { sig: opts.sig } : {}),
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
  };
}

/**
 * WhatsApp-style device linking: an **authority grant** hands the vault's
 * recovery *signing* key (the root that signs device records + the keybox) to a
 * single already-approved OWNER device, so it can enrol further devices without
 * the 24-word phrase — exactly like a WhatsApp companion phone.
 *
 * The grant is age-sealed to ONE device's recipient (not to the shared keybox),
 * so members/agents never receive it: least-privilege is preserved. Reused
 * verification unchanged — the grant only changes *who holds* the signing key,
 * never *what a verifier accepts* (a forged grant yields a key whose public half
 * won't match the pinned recovery root, so everything it signs is rejected).
 */
interface AuthorityGrantPayload {
  v: 1;
  /** Ed25519 recovery signing private scalar (32 bytes), base64. */
  recoverySigningPrivateKey: string;
}

export async function sealAuthorityGrant(
  recoverySigning: RecoverySigningKey,
  deviceRecipient: string,
): Promise<string> {
  const payload: AuthorityGrantPayload = {
    v: 1,
    recoverySigningPrivateKey: base64.encode(recoverySigning.privateKey),
  };
  return encryptSecrets(JSON.stringify(payload), [deviceRecipient]);
}

/**
 * Open an authority grant with a device identity, returning the recovery signing
 * key. The public half is re-derived from the sealed private scalar so the
 * caller can confirm it matches the vault's pinned recovery root before trusting
 * it — a grant carrying the wrong key gains no authority.
 */
export async function openAuthorityGrant(
  armored: string,
  deviceIdentity: string,
): Promise<RecoverySigningKey> {
  const json = await decryptSecrets(armored, deviceIdentity);
  const parsed = JSON.parse(json) as Partial<AuthorityGrantPayload>;
  if (parsed.v !== 1 || typeof parsed.recoverySigningPrivateKey !== "string") {
    throw new Error("authority grant: malformed payload");
  }
  const privateKey = base64.decode(parsed.recoverySigningPrivateKey);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}
