/**
 * Wallet-derived vault identity (EVM signature-as-seed).
 *
 * For web3-native users, an EVM wallet (MetaMask primary; Rabby, Coinbase,
 * Trust, WalletConnect, and Phantom-in-EVM-mode all come free) becomes a third
 * seed source next to the random device key and the 24-word BIP39 phrase.
 *
 * EVM wallets *sign*, they do not *encrypt* — and their account key is
 * secp256k1, not the X25519 that `age` needs. So we cannot use a wallet as an
 * age recipient directly, nor rely on the deprecated `eth_decrypt`. Instead we
 * use the standard signature-as-seed pattern: the wallet signs one fixed,
 * domain-separated message; the (RFC-6979 deterministic) signature is run
 * through HKDF into a 64-byte seed; that seed feeds the *exact* derivation
 * `recovery.ts` uses for the BIP39 phrase. Same address → same signature →
 * same vault, on any device, with nothing stored besides the wallet.
 *
 * Everything after the seed — age recipient, signed device records, safety
 * numbers, trust store — is identical to the recovery path. See
 * docs/architecture/wallet-unlock.md.
 */
import { bech32 } from "@scure/base";
import { identityToRecipient } from "age-encryption";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha512, sha256 } from "@noble/hashes/sha2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import type { RecoveryIdentity, RecoverySigningKey } from "./recovery";

export type { RecoveryIdentity, RecoverySigningKey };

/**
 * The message the wallet signs. THIS STRING IS THE KEY: it must be versioned,
 * app-scoped, and NEVER reused anywhere else in NoteKit, or the vault key
 * leaks. Human-readable (EIP-191 personal_sign) so the user sees what they
 * approve. Static — no address interpolation — so re-derivation never depends
 * on address checksum casing; the signing account's key already makes it
 * deterministic.
 */
export const WALLET_SEED_MESSAGE =
  "NoteKit vault key derivation\n\n" +
  "Sign to unlock your end-to-end encrypted notes.\n" +
  "This signature never leaves your device and is not a transaction.\n\n" +
  "v1";

// Domain tag so the Ed25519 signing key shares no material with the age key —
// mirrors recovery.ts's SIGNING_DOMAIN. Distinct value so a wallet identity and
// a phrase identity never collide even if (theoretically) seeds matched.
const SIGNING_DOMAIN = "notekit-wallet-sign-v1";
// HKDF info, separating the seed-stretch from any other use of the sig.
const SEED_INFO = new TextEncoder().encode("notekit-wallet-seed-v1");
const SEED_BYTES = 64; // match BIP39's mnemonicToSeed() output length

/** A function that asks the connected wallet to personal_sign a message. */
export type WalletSigner = (message: string) => Promise<string>;

/**
 * Stretch a raw wallet signature into a uniform 64-byte seed. A secp256k1
 * signature is not a uniform scalar, so we HKDF it (no salt — the signature is
 * the high-entropy input) before any slicing.
 */
export function walletSeedFromSignature(signatureHex: string): Uint8Array {
  const sig = hexToBytes(signatureHex.replace(/^0x/, ""));
  if (sig.length < 64) {
    throw new Error("Wallet signature too short to derive a key");
  }
  return hkdf(sha256, sig, new Uint8Array(0), SEED_INFO, SEED_BYTES);
}

/**
 * Derive the age (X25519) encryption identity from a wallet seed. Identical
 * shape to recovery.ts: first 32 bytes → bech32 age secret key.
 */
export async function walletIdentityFromSeed(
  seed: Uint8Array,
): Promise<RecoveryIdentity> {
  const scalar = seed.slice(0, 32);
  const identity = bech32
    .encodeFromBytes("AGE-SECRET-KEY-", scalar)
    .toUpperCase();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

/**
 * Derive the Ed25519 signing key (the vault's root of trust for device records)
 * from a wallet seed. Domain-separated hash, identical to
 * recoverySigningFromMnemonic so wallet-rooted vaults sign records the same way.
 */
export function walletSigningFromSeed(seed: Uint8Array): RecoverySigningKey {
  const tag = new TextEncoder().encode(SIGNING_DOMAIN);
  const material = new Uint8Array(tag.length + seed.length);
  material.set(tag, 0);
  material.set(seed, tag.length);
  const privateKey = sha512(material).slice(0, 32);
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export interface WalletVaultIdentity {
  identity: RecoveryIdentity;
  signing: RecoverySigningKey;
}

/**
 * Full wallet-unlock derivation: ask the wallet to sign the fixed message, then
 * derive both the age identity and the Ed25519 signing key. The single entry
 * point callers use; it mirrors recoveryFromMnemonic + recoverySigningFromMnemonic.
 */
export async function deriveWalletVaultIdentity(
  sign: WalletSigner,
): Promise<WalletVaultIdentity> {
  const signatureHex = await sign(WALLET_SEED_MESSAGE);
  const seed = walletSeedFromSignature(signatureHex);
  const [identity, signing] = [
    await walletIdentityFromSeed(seed),
    walletSigningFromSeed(seed),
  ];
  return { identity, signing };
}
