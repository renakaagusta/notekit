import { describe, expect, it } from "vitest";
import {
  generateRecoveryMnemonic,
  recoverySigningFromMnemonic,
} from "./recovery";
import {
  deviceSigningPayload,
  recoverySigningPayload,
  sign,
  toB64,
  verify,
} from "./signing";

// A fixed valid 24-word phrase so derivation is reproducible across runs.
const PHRASE =
  "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";

describe("recovery signing-key derivation", () => {
  it("is deterministic for a given mnemonic", async () => {
    const a = await recoverySigningFromMnemonic(PHRASE);
    const b = await recoverySigningFromMnemonic(PHRASE);
    expect(toB64(a.publicKey)).toBe(toB64(b.publicKey));
    expect(a.publicKey.length).toBe(32);
    expect(a.privateKey.length).toBe(32);
  });

  it("differs between distinct mnemonics", async () => {
    const a = await recoverySigningFromMnemonic(PHRASE);
    const b = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    expect(toB64(a.publicKey)).not.toBe(toB64(b.publicKey));
  });

  it("rejects an invalid phrase", async () => {
    await expect(recoverySigningFromMnemonic("not a real phrase")).rejects.toThrow();
  });
});

describe("device record signing", () => {
  it("round-trips a valid signature", async () => {
    const { privateKey, publicKey } = await recoverySigningFromMnemonic(PHRASE);
    const fields = {
      deviceId: "devABC",
      recipient: "age1realdevicepubkey",
      addedAt: "2026-06-01T00:00:00.000Z",
    };
    const sig = sign(deviceSigningPayload(fields), privateKey);
    expect(verify(deviceSigningPayload(fields), sig, publicKey)).toBe(true);
  });

  it("rejects a tampered recipient (the key-substitution attack)", async () => {
    const { privateKey, publicKey } = await recoverySigningFromMnemonic(PHRASE);
    const honest = {
      deviceId: "devABC",
      recipient: "age1realdevicepubkey",
      addedAt: "2026-06-01T00:00:00.000Z",
    };
    const sig = sign(deviceSigningPayload(honest), privateKey);
    // Attacker swaps in their own recipient but keeps the signature.
    const forged = { ...honest, recipient: "age1ATTACKERpubkey" };
    expect(verify(deviceSigningPayload(forged), sig, publicKey)).toBe(false);
  });

  it("rejects a signature from the wrong key", async () => {
    const honest = await recoverySigningFromMnemonic(PHRASE);
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const fields = {
      deviceId: "devABC",
      recipient: "age1realdevicepubkey",
      addedAt: "2026-06-01T00:00:00.000Z",
    };
    const sig = sign(deviceSigningPayload(fields), attacker.privateKey);
    expect(verify(deviceSigningPayload(fields), sig, honest.publicKey)).toBe(false);
  });

  it("returns false (not throw) on a malformed signature", async () => {
    const { publicKey } = await recoverySigningFromMnemonic(PHRASE);
    const payload = deviceSigningPayload({
      deviceId: "d",
      recipient: "r",
      addedAt: "t",
    });
    expect(verify(payload, "!!!not-base64!!!", publicKey)).toBe(false);
    expect(verify(payload, "", publicKey)).toBe(false);
  });
});

describe("domain separation", () => {
  it("a device signature does not validate as a recovery signature", async () => {
    const { privateKey, publicKey } = await recoverySigningFromMnemonic(PHRASE);
    const deviceSig = sign(
      deviceSigningPayload({ deviceId: "d", recipient: "age1x", addedAt: "t" }),
      privateKey,
    );
    // Same field values, but the recovery payload has a different domain tag.
    const recoveryPayload = recoverySigningPayload({
      recipient: "age1x",
      signingKey: "d",
      createdAt: "t",
    });
    expect(verify(recoveryPayload, deviceSig, publicKey)).toBe(false);
  });
});
