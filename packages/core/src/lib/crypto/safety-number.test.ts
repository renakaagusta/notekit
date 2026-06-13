import { describe, expect, it } from "vitest";
import { deriveFingerprint, formatFingerprint } from "./fingerprint";

// The safety number used to verify a sharing partner's signing key (and during
// pairing) must be deterministic and diverge when the key differs — that's the
// whole MITM-detection property.
describe("safety number (fingerprint)", () => {
  it("is deterministic for the same key", async () => {
    const a = await deriveFingerprint("age1examplesigningkeyAAAA");
    const b = await deriveFingerprint("age1examplesigningkeyAAAA");
    expect(formatFingerprint(a)).toBe(formatFingerprint(b));
  });

  it("diverges for a substituted key (so a swap is human-visible)", async () => {
    const honest = await deriveFingerprint("age1honestsigningkey");
    const attacker = await deriveFingerprint("age1attackersigningkey");
    expect(formatFingerprint(honest)).not.toBe(formatFingerprint(attacker));
  });

  it("renders three emoji+word slots", async () => {
    const s = formatFingerprint(await deriveFingerprint("age1whatever"));
    expect(s.split(" · ")).toHaveLength(3);
  });
});
