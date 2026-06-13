/**
 * Recovery identity. A 24-word BIP39 mnemonic is the user's last-resort key.
 * We derive a deterministic age X25519 identity from its seed so the same
 * mnemonic always unlocks the same vault — without anyone holding a copy of
 * the private key besides the user.
 *
 * Derivation: BIP39 seed → first 32 bytes → bech32-encoded with the age HRP.
 * Same shape that `generateX25519Identity` produces internally.
 */
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { bech32 } from "@scure/base";
import { identityToRecipient } from "age-encryption";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha512 } from "@noble/hashes/sha2.js";

const STRENGTH_24_WORDS = 256;
const BIP39_PASSPHRASE = "notekit-recovery-v1";
// Domain tag so the Ed25519 signing key is independent of the age (X25519)
// encryption key even though both come from the same BIP39 seed.
const SIGNING_DOMAIN = "notekit-recovery-sign-v1";

export interface RecoveryIdentity {
  identity: string;
  recipient: string;
}

export function generateRecoveryMnemonic(): string {
  return generateMnemonic(wordlist, STRENGTH_24_WORDS);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(" ");
}

export async function recoveryFromMnemonic(
  mnemonic: string,
): Promise<RecoveryIdentity> {
  const clean = normalizeMnemonic(mnemonic);
  if (!isValidMnemonic(clean)) {
    throw new Error("Invalid recovery phrase");
  }
  const seed = await mnemonicToSeed(clean, BIP39_PASSPHRASE);
  const scalar = seed.slice(0, 32);
  const identity = bech32
    .encodeFromBytes("AGE-SECRET-KEY-", scalar)
    .toUpperCase();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

export async function recipientFromMnemonic(mnemonic: string): Promise<string> {
  const { recipient } = await recoveryFromMnemonic(mnemonic);
  return recipient;
}

export interface RecoverySigningKey {
  /** Ed25519 private scalar (32 bytes). Never published. */
  privateKey: Uint8Array;
  /** Ed25519 public key (32 bytes). Published in `recovery.json`. */
  publicKey: Uint8Array;
}

/**
 * Derive the recovery *signing* key (Ed25519) from the same mnemonic that
 * yields the recovery encryption key. The recovery key is the vault's root of
 * trust: every device record is signed by it so clients can reject a recipient
 * an attacker tried to inject (see device-key-resilience §5). Derived with a
 * domain-separating hash so it shares no key material with the age key.
 */
export async function recoverySigningFromMnemonic(
  mnemonic: string,
): Promise<RecoverySigningKey> {
  const clean = normalizeMnemonic(mnemonic);
  if (!isValidMnemonic(clean)) {
    throw new Error("Invalid recovery phrase");
  }
  const seed = await mnemonicToSeed(clean, BIP39_PASSPHRASE);
  const tag = new TextEncoder().encode(SIGNING_DOMAIN);
  const material = new Uint8Array(tag.length + seed.length);
  material.set(tag, 0);
  material.set(seed, tag.length);
  const privateKey = sha512(material).slice(0, 32);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}
