import { describe, expect, it } from "vitest";
import {
  decryptWithPassphrase,
  encryptToPassphrase,
  generateSharePassphrase,
} from "./vault-crypto";

describe("passphrase share (age scrypt)", () => {
  it("round-trips plaintext through a passphrase", async () => {
    const pass = generateSharePassphrase();
    const armored = await encryptToPassphrase("shared note body", pass);
    expect(armored).toContain("BEGIN AGE ENCRYPTED FILE");
    expect(await decryptWithPassphrase(armored, pass)).toBe("shared note body");
  });

  it("fails to decrypt with the wrong passphrase", async () => {
    const armored = await encryptToPassphrase("secret", generateSharePassphrase());
    await expect(
      decryptWithPassphrase(armored, generateSharePassphrase()),
    ).rejects.toThrow();
  });

  it("generates distinct, multi-word passphrases", () => {
    const a = generateSharePassphrase();
    const b = generateSharePassphrase();
    expect(a.split("-").length).toBe(6);
    expect(a).not.toBe(b);
  });
});
