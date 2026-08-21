import { generateIdentity, identityToRecipient } from "age-encryption";
import { describe, expect, it } from "vitest";
import {
  generateVaultKey,
  sealKeybox,
  openKeybox,
  keyboxSigningPayload,
} from "./keybox";
import { encryptSecrets, decryptSecrets } from "./vault-crypto";

async function device() {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

describe("keybox (envelope encryption)", () => {
  it("round-trips the vault key for a device in the recipient set", async () => {
    const d = await device();
    const vk = await generateVaultKey();
    const box = await sealKeybox(vk, [d.recipient]);
    const opened = await openKeybox(box, d.identity);
    expect(opened.vaultKey.identity).toBe(vk.identity);
    expect(opened.vaultKey.recipient).toBe(vk.recipient);
    expect(opened.epoch).toBe(1);
  });

  it("content sealed to the vault key opens after unlocking the keybox", async () => {
    const d = await device();
    const vk = await generateVaultKey();
    const box = await sealKeybox(vk, [d.recipient]);

    // content is sealed to the single vault recipient, NOT the device
    const secret = "s3cr3t-value";
    const sealed = await encryptSecrets(secret, [vk.recipient]);

    const opened = await openKeybox(box, d.identity);
    const plain = await decryptSecrets(sealed, opened.vaultKey.identity);
    expect(plain).toBe(secret);
  });

  it("every device in the set can open the same keybox (O(1) add)", async () => {
    const [a, b, c] = await Promise.all([device(), device(), device()]);
    const vk = await generateVaultKey();
    // add device C = one keybox sealed to all three recipients; content untouched
    const box = await sealKeybox(vk, [a.recipient, b.recipient, c.recipient]);
    for (const d of [a, b, c]) {
      const opened = await openKeybox(box, d.identity);
      expect(opened.vaultKey.identity).toBe(vk.identity);
    }
  });

  it("a device outside the recipient set cannot open the keybox", async () => {
    const inside = await device();
    const outside = await device();
    const vk = await generateVaultKey();
    const box = await sealKeybox(vk, [inside.recipient]);
    await expect(openKeybox(box, outside.identity)).rejects.toThrow();
  });

  it("carries epoch and sig through the round-trip", async () => {
    const d = await device();
    const vk = await generateVaultKey();
    const box = await sealKeybox(vk, [d.recipient], { epoch: 4, sig: "abc==" });
    const opened = await openKeybox(box, d.identity);
    expect(opened.epoch).toBe(4);
    expect(opened.sig).toBe("abc==");
  });

  it("rejects a payload whose recipient was tampered to not match the identity", async () => {
    const d = await device();
    const vk = await generateVaultKey();
    const other = await generateVaultKey();
    // hand-craft a payload with a mismatched recipient
    const tampered = JSON.stringify({
      v: 1,
      epoch: 1,
      vaultKey: { identity: vk.identity, recipient: other.recipient },
    });
    const box = await encryptSecrets(tampered, [d.recipient]);
    await expect(openKeybox(box, d.identity)).rejects.toThrow(/recipient/);
  });

  it("signing payload is deterministic and binds epoch + recipient", () => {
    const p1 = keyboxSigningPayload({ epoch: 2, recipient: "age1xyz" });
    const p2 = keyboxSigningPayload({ epoch: 2, recipient: "age1xyz" });
    const p3 = keyboxSigningPayload({ epoch: 3, recipient: "age1xyz" });
    expect(p1).toEqual(p2);
    expect(p1).not.toEqual(p3);
  });
});
