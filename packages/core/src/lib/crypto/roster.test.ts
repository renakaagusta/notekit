import { ed25519 } from "@noble/curves/ed25519.js";
import { generateIdentity, identityToRecipient } from "age-encryption";
import { describe, expect, it } from "vitest";
import {
  type RosterDocument,
  type RosterEntry,
  signRoster,
  verifyRosterChain,
  rosterTrusts,
  RosterChainError,
} from "./roster";
import { toB64 } from "./signing";

interface Signer {
  signPub: string;
  signPriv: Uint8Array;
}

function newSigner(): Signer {
  const signPriv = ed25519.utils.randomSecretKey();
  return { signPub: toB64(ed25519.getPublicKey(signPriv)), signPriv };
}

async function newDevice(): Promise<{ signer: Signer; recipient: string; deviceId: string }> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  return { signer: newSigner(), recipient, deviceId: Math.random().toString(36).slice(2, 12) };
}

function entryFor(
  device: { signer: Signer; recipient: string; deviceId: string },
  vouchedBy: string,
): RosterEntry {
  return {
    deviceId: device.deviceId,
    name: `device-${device.deviceId}`,
    signPub: device.signer.signPub,
    recipient: device.recipient,
    addedAt: "2026-01-01T00:00:00.000Z",
    vouchedBy,
  };
}

// eslint-disable-next-line max-lines-per-function -- one describe grouping the full set of chain-verification adversarial cases; splitting would fragment a cohesive threat suite
describe("roster chain verification (Model B)", () => {
  it("a genesis roster signed by the master verifies and trusts its device", async () => {
    const master = newSigner();
    const deviceA = await newDevice();
    const genesis = signRoster(
      { version: 1, entries: [entryFor(deviceA, master.signPub)] },
      master,
    );
    const current = verifyRosterChain([genesis], master.signPub);
    expect(rosterTrusts(current, deviceA.signer.signPub)).toBe(true);
  });

  it("an in-roster device can add another device WITHOUT the master, and the new device chains", async () => {
    const master = newSigner();
    const deviceA = await newDevice();
    const deviceB = await newDevice();

    const genesis = signRoster(
      { version: 1, entries: [entryFor(deviceA, master.signPub)] },
      master,
    );

    // Device A (in roster) signs v2 that admits B — master private key unused.
    const v2 = signRoster(
      {
        version: 2,
        entries: [entryFor(deviceA, master.signPub), entryFor(deviceB, deviceA.signer.signPub)],
      },
      deviceA.signer,
    );
    const current = verifyRosterChain([genesis, v2], master.signPub);
    expect(rosterTrusts(current, deviceB.signer.signPub)).toBe(true);
    expect(v2.signedBy).toBe(deviceA.signer.signPub);
    expect(v2.signedBy).not.toBe(master.signPub);

    // Chain continues: B (now in roster) admits a third device C.
    const deviceC = await newDevice();
    const v3 = signRoster(
      {
        version: 3,
        entries: [
          entryFor(deviceA, master.signPub),
          entryFor(deviceB, deviceA.signer.signPub),
          entryFor(deviceC, deviceB.signer.signPub),
        ],
      },
      deviceB.signer,
    );
    const c = verifyRosterChain([genesis, v2, v3], master.signPub);
    expect(rosterTrusts(c, deviceC.signer.signPub)).toBe(true);
  });

  it("an in-roster device can revoke another device WITHOUT the master", async () => {
    const master = newSigner();
    const deviceA = await newDevice();
    const deviceB = await newDevice();
    const genesis = signRoster(
      {
        version: 1,
        entries: [entryFor(deviceA, master.signPub), entryFor(deviceB, master.signPub)],
      },
      master,
    );
    // A revokes B: v2 drops B's entry, signed by A.
    const v2 = signRoster(
      { version: 2, entries: [entryFor(deviceA, master.signPub)] },
      deviceA.signer,
    );
    const current = verifyRosterChain([genesis, v2], master.signPub);
    expect(rosterTrusts(current, deviceA.signer.signPub)).toBe(true);
    expect(rosterTrusts(current, deviceB.signer.signPub)).toBe(false);
  });

  it("FORGERY: a version signed by a key not in the prior version is rejected (fail-closed)", async () => {
    const master = newSigner();
    const deviceA = await newDevice();
    const attacker = await newDevice();
    const genesis = signRoster(
      { version: 1, entries: [entryFor(deviceA, master.signPub)] },
      master,
    );
    // Attacker forges v2 admitting itself, signed by its own (untrusted) key.
    const forged = signRoster(
      {
        version: 2,
        entries: [entryFor(deviceA, master.signPub), entryFor(attacker, attacker.signer.signPub)],
      },
      attacker.signer,
    );
    expect(() => verifyRosterChain([genesis, forged], master.signPub)).toThrow(RosterChainError);
  });

  it("FORGERY: a genesis not signed by the pinned master is rejected", async () => {
    const master = newSigner();
    const impostor = newSigner();
    const deviceA = await newDevice();
    const genesis = signRoster(
      { version: 1, entries: [entryFor(deviceA, impostor.signPub)] },
      impostor,
    );
    expect(() => verifyRosterChain([genesis], master.signPub)).toThrow(/pinned master/);
  });

  it("FORGERY: a tampered entry breaks the signature (injected recipient rejected)", async () => {
    const master = newSigner();
    const deviceA = await newDevice();
    const attackerRecipient = (await newDevice()).recipient;
    const genesis = signRoster(
      { version: 1, entries: [entryFor(deviceA, master.signPub)] },
      master,
    );
    // A repo-writer swaps the device's recipient to redirect the vault key.
    const original = genesis.entries[0];
    if (!original) throw new Error("test setup: missing genesis entry");
    const tampered: RosterDocument = {
      ...genesis,
      entries: [{ ...original, recipient: attackerRecipient }],
    };
    expect(() => verifyRosterChain([tampered], master.signPub)).toThrow(/signature is invalid/);
  });

  it("FORGERY: rolling a version number backward is rejected", async () => {
    const master = newSigner();
    const deviceA = await newDevice();
    const genesis = signRoster(
      { version: 1, entries: [entryFor(deviceA, master.signPub)] },
      master,
    );
    const stale = signRoster(
      { version: 1, entries: [entryFor(deviceA, master.signPub)] },
      deviceA.signer,
    );
    expect(() => verifyRosterChain([genesis, stale], master.signPub)).toThrow(/rollback|increase/);
  });

  it("full-recovery: the master can re-sign a fresh roster when all devices are lost", async () => {
    const master = newSigner();
    const deviceA = await newDevice();
    const deviceB = await newDevice();
    const genesis = signRoster(
      { version: 1, entries: [entryFor(deviceA, master.signPub)] },
      master,
    );
    // All devices lost; user types the phrase → master re-vouches a new device B.
    const recovered = signRoster(
      { version: 2, entries: [entryFor(deviceB, master.signPub)] },
      master,
    );
    const current = verifyRosterChain([genesis, recovered], master.signPub);
    expect(rosterTrusts(current, deviceB.signer.signPub)).toBe(true);
    expect(rosterTrusts(current, deviceA.signer.signPub)).toBe(false);
  });
});
