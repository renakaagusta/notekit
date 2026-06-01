import { beforeEach, describe, expect, it } from "vitest";
import {
  TrustDowngradeError,
  getPinnedSigningKey,
  verifySigningKeyTrust,
} from "./trust-store";

// Minimal in-memory localStorage so the pin logic is testable under any env.
function installMockLocalStorage() {
  const map = new Map<string, string>();
  const mock = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  (globalThis as { localStorage?: unknown }).localStorage = mock;
}

const VAULT = "vlt_test";

describe("recovery signing-key trust (downgrade defence)", () => {
  beforeEach(() => installMockLocalStorage());

  it("legacy never-signed vault (no key, no pin) passes and pins nothing", () => {
    expect(() => verifySigningKeyTrust(VAULT, null)).not.toThrow();
    expect(getPinnedSigningKey(VAULT)).toBeNull();
  });

  it("pins the signing key on first sight of signed mode", () => {
    verifySigningKeyTrust(VAULT, "KEY_A");
    expect(getPinnedSigningKey(VAULT)).toBe("KEY_A");
  });

  it("rejects a downgrade — signing key removed after being seen", () => {
    verifySigningKeyTrust(VAULT, "KEY_A"); // pin it
    expect(() => verifySigningKeyTrust(VAULT, null)).toThrow(TrustDowngradeError);
  });

  it("rejects a substituted signing key (changed since pin)", () => {
    verifySigningKeyTrust(VAULT, "KEY_A");
    expect(() => verifySigningKeyTrust(VAULT, "KEY_B")).toThrow(
      /changed|substitution/i,
    );
  });

  it("rejects a key that doesn't match the local recovery mnemonic", () => {
    expect(() =>
      verifySigningKeyTrust(VAULT, "KEY_FROM_REPO", "KEY_FROM_MY_PHRASE"),
    ).toThrow(/recovery phrase|tamper/i);
  });

  it("accepts a key that matches both the mnemonic and the pin", () => {
    verifySigningKeyTrust(VAULT, "KEY_A", "KEY_A"); // first sight, matches mnemonic
    expect(() => verifySigningKeyTrust(VAULT, "KEY_A", "KEY_A")).not.toThrow();
  });
});
