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

const STRENGTH_24_WORDS = 256;
const BIP39_PASSPHRASE = "notekit-recovery-v1";

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
