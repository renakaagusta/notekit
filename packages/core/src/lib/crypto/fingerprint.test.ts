/**
 * The pairing fingerprint's whole job is human MITM detection: the same key
 * must always render the same code (so honest pairings match), and a swapped
 * key must render a different one often enough to be caught. These tests pin
 * both properties.
 */
import { describe, expect, it } from "vitest";
import { deriveFingerprint, formatFingerprint } from "./fingerprint";

const KEY_A =
  "age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p";
const KEY_B =
  "age1lvyvwawkr0mcnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnns0sdfg";

describe("deriveFingerprint", () => {
  it("is deterministic for the same key", async () => {
    const a1 = formatFingerprint(await deriveFingerprint(KEY_A));
    const a2 = formatFingerprint(await deriveFingerprint(KEY_A));
    expect(a1).toBe(a2);
  });

  it("ignores surrounding whitespace", async () => {
    const clean = formatFingerprint(await deriveFingerprint(KEY_A));
    const padded = formatFingerprint(await deriveFingerprint(`  ${KEY_A}\n`));
    expect(padded).toBe(clean);
  });

  it("diverges when the key is swapped", async () => {
    const a = formatFingerprint(await deriveFingerprint(KEY_A));
    const b = formatFingerprint(await deriveFingerprint(KEY_B));
    expect(b).not.toBe(a);
  });

  it("renders three emoji+word slots", async () => {
    const slots = await deriveFingerprint(KEY_A);
    expect(slots).toHaveLength(3);
    for (const s of slots) {
      expect(s.emoji.length).toBeGreaterThan(0);
      expect(s.word.length).toBeGreaterThan(0);
    }
    expect(formatFingerprint(slots).split(" · ")).toHaveLength(3);
  });

  it("distributes across the alphabet (not a constant)", async () => {
    // Sanity that the hash actually drives the slots: a handful of distinct
    // keys shouldn't all collapse to the same fingerprint.
    const keys = Array.from({ length: 12 }, (_, i) => `${KEY_A}#${i}`);
    const prints = new Set(
      await Promise.all(
        keys.map(async (k) => formatFingerprint(await deriveFingerprint(k))),
      ),
    );
    expect(prints.size).toBeGreaterThan(1);
  });
});
