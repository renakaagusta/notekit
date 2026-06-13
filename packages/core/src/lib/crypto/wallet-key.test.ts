import { describe, it, expect } from "vitest";
import {
  WALLET_SEED_MESSAGE,
  walletSeedFromSignature,
  walletIdentityFromSeed,
  walletSigningFromSeed,
  deriveWalletVaultIdentity,
  type WalletSigner,
} from "./wallet-key";

// Two distinct, realistic 65-byte (r,s,v) secp256k1 personal_sign outputs.
const SIG_A =
  "0x" +
  "1".repeat(64) + // r
  "2".repeat(64) + // s
  "1b"; // v
const SIG_B =
  "0x" +
  "a".repeat(64) +
  "b".repeat(64) +
  "1c";

/** A wallet that always returns the same signature — the deterministic case. */
function fixedSigner(sig: string): WalletSigner {
  return async () => sig;
}

describe("walletSeedFromSignature", () => {
  it("stretches a signature to a 64-byte seed", () => {
    expect(walletSeedFromSignature(SIG_A)).toHaveLength(64);
  });

  it("is deterministic for the same signature", () => {
    expect(walletSeedFromSignature(SIG_A)).toEqual(walletSeedFromSignature(SIG_A));
  });

  it("tolerates a missing 0x prefix", () => {
    expect(walletSeedFromSignature(SIG_A.slice(2))).toEqual(
      walletSeedFromSignature(SIG_A),
    );
  });

  it("diverges for different signatures", () => {
    expect(walletSeedFromSignature(SIG_A)).not.toEqual(
      walletSeedFromSignature(SIG_B),
    );
  });

  it("rejects a signature that is too short", () => {
    expect(() => walletSeedFromSignature("0xdeadbeef")).toThrow();
  });
});

describe("walletIdentityFromSeed", () => {
  it("derives a valid age identity + recipient", async () => {
    const seed = walletSeedFromSignature(SIG_A);
    const { identity, recipient } = await walletIdentityFromSeed(seed);
    expect(identity).toMatch(/^AGE-SECRET-KEY-1/);
    expect(recipient).toMatch(/^age1/);
  });

  it("is deterministic — same signature unlocks the same vault", async () => {
    const a = await walletIdentityFromSeed(walletSeedFromSignature(SIG_A));
    const b = await walletIdentityFromSeed(walletSeedFromSignature(SIG_A));
    expect(a.recipient).toBe(b.recipient);
  });

  it("different wallets get different identities", async () => {
    const a = await walletIdentityFromSeed(walletSeedFromSignature(SIG_A));
    const b = await walletIdentityFromSeed(walletSeedFromSignature(SIG_B));
    expect(a.recipient).not.toBe(b.recipient);
  });
});

describe("walletSigningFromSeed", () => {
  it("derives a 32-byte Ed25519 keypair", () => {
    const { privateKey, publicKey } = walletSigningFromSeed(
      walletSeedFromSignature(SIG_A),
    );
    expect(privateKey).toHaveLength(32);
    expect(publicKey).toHaveLength(32);
  });

  it("is domain-separated from the age key (no shared material)", () => {
    const seed = walletSeedFromSignature(SIG_A);
    const signing = walletSigningFromSeed(seed);
    // The age scalar is seed[0..32]; the signing key must not equal it.
    expect(signing.privateKey).not.toEqual(seed.slice(0, 32));
  });

  it("is deterministic for the same signature", () => {
    const a = walletSigningFromSeed(walletSeedFromSignature(SIG_A));
    const b = walletSigningFromSeed(walletSeedFromSignature(SIG_A));
    expect(a.publicKey).toEqual(b.publicKey);
  });
});

describe("deriveWalletVaultIdentity", () => {
  it("signs the fixed domain-separated message", async () => {
    let seen: string | null = null;
    const signer: WalletSigner = async (msg) => {
      seen = msg;
      return SIG_A;
    };
    await deriveWalletVaultIdentity(signer);
    expect(seen).toBe(WALLET_SEED_MESSAGE);
  });

  it("yields a stable identity + signing key across reconnects", async () => {
    const first = await deriveWalletVaultIdentity(fixedSigner(SIG_A));
    const second = await deriveWalletVaultIdentity(fixedSigner(SIG_A));
    expect(second.identity.recipient).toBe(first.identity.recipient);
    expect(second.signing.publicKey).toEqual(first.signing.publicKey);
  });
});
