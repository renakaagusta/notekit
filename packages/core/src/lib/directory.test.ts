import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateRecoveryMnemonic,
  recoverySigningFromMnemonic,
} from "./crypto/recovery";
import { deviceSigningPayload, sign, toB64 } from "./crypto/signing";

// Mock the transport so we control exactly what the "server" returns — the
// whole point is that a malicious/buggy server can't smuggle in a recipient.
vi.mock("./api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "./api";
import { fetchVerifiedKeys, isNotFound } from "./directory";

const PHRASE =
  "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";

function signedDevice(
  priv: Uint8Array,
  fields: { deviceId: string; recipient: string; addedAt: string },
) {
  return { ...fields, sig: sign(deviceSigningPayload(fields), priv) };
}

describe("fetchVerifiedKeys", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("keeps validly-signed recipients and drops forged ones", async () => {
    const { privateKey, publicKey } = await recoverySigningFromMnemonic(PHRASE);
    const signingKey = toB64(publicKey);

    const good = signedDevice(privateKey, {
      deviceId: "good",
      recipient: "age1goodpubkey",
      addedAt: "2026-06-01T00:00:00.000Z",
    });
    // Server tries to smuggle in an attacker recipient with a bogus signature.
    const forged = {
      deviceId: "evil",
      recipient: "age1ATTACKERpubkey",
      addedAt: "2026-06-01T00:00:00.000Z",
      sig: "AAAA",
    };

    vi.mocked(apiFetch).mockResolvedValue({
      email: "b@example.com",
      signingKey,
      devices: [good, forged],
    });

    const res = await fetchVerifiedKeys("b@example.com");
    expect(res?.recipients).toEqual(["age1goodpubkey"]);
    expect(res?.rejected).toBe(1);
  });

  it("drops everything if the signing key doesn't match (substituted root)", async () => {
    const honest = await recoverySigningFromMnemonic(PHRASE);
    const good = signedDevice(honest.privateKey, {
      deviceId: "good",
      recipient: "age1goodpubkey",
      addedAt: "2026-06-01T00:00:00.000Z",
    });
    // Server swaps in a *different* (valid) signing key — the real records,
    // signed by the honest key, no longer verify against it.
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const signingKey = toB64(attacker.publicKey);
    void honest;

    vi.mocked(apiFetch).mockResolvedValue({
      email: "b@example.com",
      signingKey,
      devices: [good],
    });

    const res = await fetchVerifiedKeys("b@example.com");
    // The good record was signed by the honest key, not the advertised one.
    expect(res?.recipients).toEqual([]);
  });

  it("maps a 404 (unknown user / nothing published) to null, not an error", () => {
    // fetchVerifiedKeys swallows exactly these into `null`.
    expect(isNotFound(Object.assign(new Error("nope"), { status: 404 }))).toBe(true);
    expect(isNotFound(new Error("404 not_found"))).toBe(true);
    expect(isNotFound(new Error("not_found"))).toBe(true);
    // Other failures must propagate, not be hidden as "no keys".
    expect(isNotFound(Object.assign(new Error("boom"), { status: 500 }))).toBe(false);
    expect(isNotFound(new Error("network error"))).toBe(false);
  });
});
