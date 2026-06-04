import { beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_PATH,
  DEVICES_PREFIX,
  MEMBERS_PREFIX,
  RECOVERY_PATH,
  SHARES_PREFIX,
  addMember,
  collectVaultRecipients,
  configureSecretsBackend,
  deviceRecordTrustedByMember,
  ensureOwnerMember,
  ensureSelfRegistered,
  extraRecipientsForItem,
  initVault,
  listDevices,
  readMembers,
  removeMember,
  readRecovery,
  readVaultConfig,
  recipientsForItem,
  unshareItemWith,
  type MemberRegistry,
  type SecretsBackend,
} from "./secrets-vault";
import type { DeviceIdentity } from "./crypto/device-key";
import {
  generateRecoveryMnemonic,
  recoverySigningFromMnemonic,
} from "./crypto/recovery";
import { deviceSigningPayload, sign, toB64 } from "./crypto/signing";

const PHRASE =
  "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";

/** Minimal in-memory vault so config logic is testable without the network. */
function memoryBackend(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  let writes = 0;
  const backend: SecretsBackend = {
    async listFiles(prefix) {
      return {
        entries: [...files.keys()]
          .filter((p) => p.startsWith(prefix))
          .map((p) => ({ path: p, sha: `sha-${p}` })),
      };
    },
    async readFile(path) {
      const content = files.get(path) ?? null;
      return { path, content, sha: content === null ? null : `sha-${path}` };
    },
    async readFileAtRef(path) {
      const content = files.get(path) ?? null;
      return { path, content, sha: content === null ? null : `sha-${path}` };
    },
    async writeFile(path, content) {
      files.set(path, content);
      writes++;
      return { path, sha: `sha-${path}-${writes}` };
    },
    async deleteFile(path) {
      files.delete(path);
      return { ok: true };
    },
  };
  return { backend, files };
}

const device: DeviceIdentity = {
  deviceId: "dev1",
  name: "Test device",
  identity: "AGE-SECRET-KEY-1TEST",
  recipient: "age1testdevicerecipient",
  createdAt: "2026-06-01T00:00:00.000Z",
};

describe("vault encryption policy (born-E2EE)", () => {
  beforeEach(() => {
    // each test installs its own backend
  });

  it("defaults to 'off' when config.json is absent (legacy vault)", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const config = await readVaultConfig();
    expect(config.encryption).toBe("off");
  });

  it("initVault stamps encryption 'required' by default and writes config.json", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);

    await initVault({ device, recoveryRecipient: "age1recovery" });

    expect(files.has(CONFIG_PATH)).toBe(true);
    expect(files.has(RECOVERY_PATH)).toBe(true);
    const config = await readVaultConfig();
    expect(config.encryption).toBe("required");
  });

  it("respects an explicit 'off' policy at init", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);

    await initVault({
      device,
      recoveryRecipient: "age1recovery",
      encryption: "off",
    });

    expect((await readVaultConfig()).encryption).toBe("off");
  });

  it("coerces an unknown encryption value to 'off' rather than trusting it", async () => {
    const { backend } = memoryBackend({
      [CONFIG_PATH]: JSON.stringify({ version: 1, encryption: "banana" }),
    });
    configureSecretsBackend(backend);
    expect((await readVaultConfig()).encryption).toBe("off");
  });
});

describe("signed recipient records (key-substitution defence)", () => {
  it("born-signed init writes a signing key + self-signed recovery + signed device", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);

    await initVault({
      device,
      recoveryRecipient: "age1recovery",
      recoverySigning,
    });

    const recovery = await readRecovery(); // throws if self-sig is invalid
    expect(recovery?.signingKey).toBeTruthy();
    expect(recovery?.sig).toBeTruthy();
  });

  it("drops an injected (unsigned) device record from the recipient set", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    await initVault({ device, recoveryRecipient: "age1recovery", recoverySigning });

    // Attacker injects their own pubkey as a "device" — no valid signature.
    files.set(
      `${DEVICES_PREFIX}attacker.json`,
      JSON.stringify({
        deviceId: "attacker",
        name: "Totally Legit",
        recipient: "age1ATTACKERpubkey",
        addedAt: "2026-06-01T00:00:00.000Z",
      }),
    );

    // A reader other than the bootstrap device, so we test the dropped path
    // (collectVaultRecipients always trusts the *current* device).
    const reader: DeviceIdentity = {
      deviceId: "reader",
      name: "Reader",
      identity: "AGE-SECRET-KEY-1READER",
      recipient: "age1readerpubkey",
      createdAt: "2026-06-01T00:00:00.000Z",
    };
    const recipients = await collectVaultRecipients(reader);

    expect(recipients).toContain(device.recipient); // legit signed device
    expect(recipients).toContain("age1recovery"); // recovery root
    expect(recipients).toContain(reader.recipient); // current device, always
    expect(recipients).not.toContain("age1ATTACKERpubkey"); // ← rejected
  });

  it("legacy (unsigned) vaults still accept every device record", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    // No recoverySigning → recovery.json has no signing key → legacy mode.
    await initVault({ device, recoveryRecipient: "age1recovery", encryption: "off" });
    files.set(
      `${DEVICES_PREFIX}other.json`,
      JSON.stringify({
        deviceId: "other",
        name: "Another device",
        recipient: "age1otherpubkey",
        addedAt: "2026-06-01T00:00:00.000Z",
      }),
    );
    const recipients = await collectVaultRecipients(device);
    expect(recipients).toContain("age1otherpubkey"); // accepted, no enforcement
  });

  it("merges share-manifest recipients into an item's recipient set", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    await initVault({ device, recoveryRecipient: "age1recovery", encryption: "off" });

    files.set(
      `${SHARES_PREFIX}note-n1.json`,
      JSON.stringify({
        version: 1,
        kind: "note",
        id: "n1",
        shares: [
          {
            email: "b@example.com",
            signingKey: "Kb",
            recipients: ["age1invitee1", "age1invitee2"],
            grantedAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(await extraRecipientsForItem("note", "n1")).toEqual([
      "age1invitee1",
      "age1invitee2",
    ]);

    const shared = await recipientsForItem("note", "n1", device);
    expect(shared).toContain(device.recipient); // vault's own
    expect(shared).toContain("age1recovery");
    expect(shared).toContain("age1invitee1"); // ← invitee persists
    expect(shared).toContain("age1invitee2");

    // An item with no manifest gets only the vault's recipients.
    const unshared = await recipientsForItem("note", "n2", device);
    expect(unshared).not.toContain("age1invitee1");
  });

  it("unshareItemWith drops a grant (forward-only) and leaves others intact", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    await initVault({ device, recoveryRecipient: "age1recovery", encryption: "off" });
    files.set(
      `${SHARES_PREFIX}note-n1.json`,
      JSON.stringify({
        version: 1,
        kind: "note",
        id: "n1",
        shares: [
          { email: "b@x.com", signingKey: "Kb", recipients: ["age1b"], grantedAt: "t" },
          { email: "c@x.com", signingKey: "Kc", recipients: ["age1c"], grantedAt: "t" },
        ],
      }),
    );

    const removed = await unshareItemWith("note", "n1", "b@x.com", device);
    expect(removed).toBe(true);

    const recips = await recipientsForItem("note", "n1", device);
    expect(recips).not.toContain("age1b"); // revoked
    expect(recips).toContain("age1c"); // other invitee kept

    // Revoking someone who wasn't shared with is a no-op.
    expect(await unshareItemWith("note", "n1", "stranger@x.com", device)).toBe(false);
  });

  it("throws when the recovery record's self-signature is invalid (tampered root)", async () => {
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const { backend } = memoryBackend({
      [RECOVERY_PATH]: JSON.stringify({
        recipient: "age1recovery",
        createdAt: "2026-06-01T00:00:00.000Z",
        signingKey: Buffer.from(recoverySigning.publicKey).toString("base64"),
        sig: "AAAA", // bogus signature
      }),
    });
    configureSecretsBackend(backend);
    await expect(readRecovery()).rejects.toThrow(/tamper/i);
  });
});

describe("first-class membership (attribution)", () => {
  // Build a signed device record owned by a member.
  function signedDevice(
    member: { privateKey: Uint8Array },
    deviceId: string,
    recipient: string,
    owner: string,
  ) {
    const addedAt = "2026-06-03T00:00:00.000Z";
    return {
      deviceId,
      name: deviceId,
      recipient,
      addedAt,
      owner,
      sig: sign(deviceSigningPayload({ deviceId, recipient, addedAt, owner }), member.privateKey),
    };
  }

  it("verifies a device against its claimed member's key, rejects mismatch", async () => {
    const a = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const members: MemberRegistry = new Map([
      ["A", { memberId: "A", signingKey: toB64(a.publicKey), role: "owner", addedAt: "t" }],
    ]);

    const good = signedDevice(a, "devA", "age1A", "A");
    expect(deviceRecordTrustedByMember(good, members)).toBe(true);

    // Same owner claim, but signed by someone else → rejected (unforgeable).
    const forged = signedDevice(attacker, "evil", "age1ATTACKER", "A");
    expect(deviceRecordTrustedByMember(forged, members)).toBe(false);

    // Unknown member → rejected.
    const unknown = signedDevice(a, "devX", "age1X", "ghost");
    expect(deviceRecordTrustedByMember(unknown, members)).toBe(false);
  });

  it("collectVaultRecipients (member-mode) unions members' devices, drops forgeries", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const a = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const bb = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());

    // Member registry: owner A + member B.
    files.set(`${MEMBERS_PREFIX}A.json`, JSON.stringify({ memberId: "A", signingKey: toB64(a.publicKey), role: "owner", addedAt: "t" }));
    files.set(`${MEMBERS_PREFIX}B.json`, JSON.stringify({ memberId: "B", signingKey: toB64(bb.publicKey), role: "member", addedAt: "t" }));
    // Recovery so the owner's recovery recipient is in the set too.
    files.set(RECOVERY_PATH, JSON.stringify({ recipient: "age1recovery", createdAt: "t" }));
    // Devices: A's (owned by A), B's (owned by B), and a forged one claiming B.
    files.set(`${DEVICES_PREFIX}devA.json`, JSON.stringify(signedDevice(a, "devA", "age1A", "A")));
    files.set(`${DEVICES_PREFIX}devB.json`, JSON.stringify(signedDevice(bb, "devB", "age1B", "B")));
    files.set(`${DEVICES_PREFIX}forged.json`, JSON.stringify(signedDevice(attacker, "forged", "age1ATTACKER", "B")));

    const reader: DeviceIdentity = {
      deviceId: "reader", name: "Reader", identity: "AGE-SECRET-KEY-1R",
      recipient: "age1reader", createdAt: "t",
    };
    const recipients = await collectVaultRecipients(reader);

    expect(recipients).toContain("age1A"); // owner A's device
    expect(recipients).toContain("age1B"); // member B's device
    expect(recipients).toContain("age1recovery");
    expect(recipients).toContain("age1reader"); // current device, always
    expect(recipients).not.toContain("age1ATTACKER"); // forged owner claim dropped
  });
});

describe("born-with-membership init", () => {
  it("writes the owner member record + attributes the bootstrap device", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);

    await initVault({
      device,
      recoveryRecipient: "age1recovery",
      recoverySigning,
      owner: { memberId: "a@example.com", displayName: "Owner A", email: "a@example.com" },
    });

    // Owner member record exists with role owner.
    expect(files.has(`${MEMBERS_PREFIX}a@example.com.json`)).toBe(true);
    const members = await readMembers();
    expect(members.get("a@example.com")?.role).toBe("owner");

    // Vault is now member-mode; the bootstrap device verifies via the owner
    // member's key, so a *different* reader still sees it in the recipient set.
    const reader: DeviceIdentity = {
      deviceId: "reader", name: "Reader", identity: "AGE-SECRET-KEY-1R",
      recipient: "age1reader2", createdAt: "t",
    };
    const recips = await collectVaultRecipients(reader);
    expect(recips).toContain(device.recipient); // owner's bootstrap device (member-verified)
    expect(recips).toContain("age1recovery");
  });
});

describe("member admission (Pt 2b)", () => {
  // A self-signed, owner-tagged device record as it arrives from the directory
  // (signed by the member's OWN key — the owner relays it verbatim).
  function foreignDevice(
    member: { privateKey: Uint8Array },
    deviceId: string,
    recipient: string,
    owner: string,
  ) {
    const addedAt = "2026-06-03T00:00:00.000Z";
    return {
      deviceId,
      name: deviceId,
      recipient,
      addedAt,
      owner,
      sig: sign(deviceSigningPayload({ deviceId, recipient, addedAt, owner }), member.privateKey),
    };
  }

  it("admits a member: copies their device, B becomes a recipient", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const ownerSigning = await recoverySigningFromMnemonic(PHRASE);
    await initVault({
      device,
      recoveryRecipient: "age1recovery",
      recoverySigning: ownerSigning,
      owner: { memberId: "a@example.com", displayName: "Owner A", email: "a@example.com" },
    });

    const b = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const bDevice = foreignDevice(b, "devB", "age1B", "b@example.com");
    const res = await addMember(
      { memberId: "b@example.com", email: "b@example.com", signingKey: toB64(b.publicKey) },
      [bDevice],
      device,
      ownerSigning,
    );

    expect(res.devicesAdded).toBe(1);
    expect(res.devicesSkipped).toBe(0);
    expect((await readMembers()).get("b@example.com")?.role).toBe("member");
    expect(files.has(`${MEMBERS_PREFIX}b@example.com.json`)).toBe(true);

    const reader: DeviceIdentity = {
      deviceId: "reader", name: "Reader", identity: "AGE-SECRET-KEY-1R",
      recipient: "age1reader", createdAt: "t",
    };
    const recips = await collectVaultRecipients(reader);
    expect(recips).toContain("age1B"); // B's verified device
    expect(recips).toContain(device.recipient); // owner still in (member-mode)
  });

  it("skips a forged device that doesn't verify against the member's key", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const ownerSigning = await recoverySigningFromMnemonic(PHRASE);
    await initVault({
      device,
      recoveryRecipient: "age1recovery",
      recoverySigning: ownerSigning,
      owner: { memberId: "a@example.com", email: "a@example.com" },
    });

    const b = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    // Claims owner b@example.com but signed by the attacker's key.
    const forged = foreignDevice(attacker, "evil", "age1EVIL", "b@example.com");
    const res = await addMember(
      { memberId: "b@example.com", email: "b@example.com", signingKey: toB64(b.publicKey) },
      [forged],
      device,
      ownerSigning,
    );

    expect(res.devicesAdded).toBe(0);
    expect(res.devicesSkipped).toBe(1);
    const reader: DeviceIdentity = {
      deviceId: "reader", name: "Reader", identity: "AGE-SECRET-KEY-1R",
      recipient: "age1reader", createdAt: "t",
    };
    expect(await collectVaultRecipients(reader)).not.toContain("age1EVIL");
  });

  it("removeMember drops the member and their devices from the set", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const ownerSigning = await recoverySigningFromMnemonic(PHRASE);
    await initVault({
      device,
      recoveryRecipient: "age1recovery",
      recoverySigning: ownerSigning,
      owner: { memberId: "a@example.com", email: "a@example.com" },
    });
    const b = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    await addMember(
      { memberId: "b@example.com", email: "b@example.com", signingKey: toB64(b.publicKey) },
      [foreignDevice(b, "devB", "age1B", "b@example.com")],
      device,
      ownerSigning,
    );

    await removeMember("b@example.com", device);

    expect((await readMembers()).has("b@example.com")).toBe(false);
    const reader: DeviceIdentity = {
      deviceId: "reader", name: "Reader", identity: "AGE-SECRET-KEY-1R",
      recipient: "age1reader", createdAt: "t",
    };
    const recips = await collectVaultRecipients(reader);
    expect(recips).not.toContain("age1B");
    expect(recips).toContain(device.recipient); // owner unaffected
  });

  it("refuses to remove the owner member", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const ownerSigning = await recoverySigningFromMnemonic(PHRASE);
    await initVault({
      device,
      recoveryRecipient: "age1recovery",
      recoverySigning: ownerSigning,
      owner: { memberId: "a@example.com", email: "a@example.com" },
    });
    await expect(removeMember("a@example.com", device)).rejects.toThrow(/owner/i);
  });

  it("ensureOwnerMember migrates a signed-mode vault into member-mode without locking the owner out", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const ownerSigning = await recoverySigningFromMnemonic(PHRASE);
    // Pre-membership signed-mode vault: recoverySigning but NO owner.
    await initVault({
      device,
      recoveryRecipient: "age1recovery",
      recoverySigning: ownerSigning,
    });
    expect(files.has(`${MEMBERS_PREFIX}a@example.com.json`)).toBe(false);
    // Bootstrap device has a recovery sig but no `owner` yet.
    expect((await listDevices()).every((d) => !d.owner)).toBe(true);

    await ensureOwnerMember(
      { memberId: "a@example.com", displayName: "Owner A", email: "a@example.com" },
      ownerSigning,
    );

    // Now member-mode, and the owner's device is attributed + still readable.
    expect((await readMembers()).get("a@example.com")?.role).toBe("owner");
    expect((await listDevices()).find((d) => d.deviceId === device.deviceId)?.owner).toBe("a@example.com");
    const reader: DeviceIdentity = {
      deviceId: "reader", name: "Reader", identity: "AGE-SECRET-KEY-1R",
      recipient: "age1reader", createdAt: "t",
    };
    expect(await collectVaultRecipients(reader)).toContain(device.recipient);
  });
});

describe("member device auto-register (Pt 3 / issue #14)", () => {
  // Seed a member-mode vault: owner A + member B (B's signing key trusted),
  // with B's first device present. Returns B's signing key for new-device tests.
  async function seedMemberVault() {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const a = await recoverySigningFromMnemonic(PHRASE);
    const b = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    files.set(`${MEMBERS_PREFIX}a@x.com.json`, JSON.stringify({ memberId: "a@x.com", signingKey: toB64(a.publicKey), role: "owner", addedAt: "t" }));
    files.set(`${MEMBERS_PREFIX}b@x.com.json`, JSON.stringify({ memberId: "b@x.com", signingKey: toB64(b.publicKey), role: "member", addedAt: "t" }));
    files.set(RECOVERY_PATH, JSON.stringify({ recipient: "age1recovery", createdAt: "t" }));
    // B's first device, signed by B.
    const addedAt = "2026-06-04T00:00:00.000Z";
    files.set(`${DEVICES_PREFIX}bdev1.json`, JSON.stringify({
      deviceId: "bdev1", name: "B phone", recipient: "age1bdev1", addedAt, owner: "b@x.com",
      sig: sign(deviceSigningPayload({ deviceId: "bdev1", recipient: "age1bdev1", addedAt, owner: "b@x.com" }), b.privateKey),
    }));
    return { files, a, b };
  }

  it("a member's new device self-registers and joins the recipient set", async () => {
    const { b } = await seedMemberVault();
    const newDevice: DeviceIdentity = {
      deviceId: "bdev2", name: "B laptop", identity: "AGE-SECRET-KEY-1B2",
      recipient: "age1bdev2", createdAt: "t",
    };
    const res = await ensureSelfRegistered({ memberId: "b@x.com" }, newDevice, b);
    expect(res.registered).toBe(true);

    const devices = await listDevices();
    const rec = devices.find((d) => d.deviceId === "bdev2");
    expect(rec?.owner).toBe("b@x.com");
    expect(deviceRecordTrustedByMember(rec!, await readMembers())).toBe(true);

    // Joins the recipient set so FUTURE writes seal to it.
    const recips = await collectVaultRecipients(newDevice);
    expect(recips).toContain("age1bdev2");
  });

  it("refuses to self-register a device whose key isn't the member's", async () => {
    await seedMemberVault();
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const newDevice: DeviceIdentity = {
      deviceId: "evil", name: "Evil", identity: "AGE-SECRET-KEY-1E",
      recipient: "age1evil", createdAt: "t",
    };
    const res = await ensureSelfRegistered({ memberId: "b@x.com" }, newDevice, attacker);
    expect(res.registered).toBe(false);
    expect(res.reason).toBe("signing_key_mismatch");
    expect((await listDevices()).some((d) => d.deviceId === "evil")).toBe(false);
  });

  it("is a no-op for a non-member account", async () => {
    const { b } = await seedMemberVault();
    const dev: DeviceIdentity = {
      deviceId: "cdev", name: "C", identity: "AGE-SECRET-KEY-1C", recipient: "age1c", createdAt: "t",
    };
    const res = await ensureSelfRegistered({ memberId: "c@x.com" }, dev, b);
    expect(res.registered).toBe(false);
    expect(res.reason).toBe("not_a_member");
  });

  it("is idempotent — already-registered device isn't rewritten", async () => {
    const { b } = await seedMemberVault();
    const existing: DeviceIdentity = {
      deviceId: "bdev1", name: "B phone", identity: "AGE-SECRET-KEY-1B1", recipient: "age1bdev1", createdAt: "t",
    };
    const res = await ensureSelfRegistered({ memberId: "b@x.com" }, existing, b);
    expect(res.registered).toBe(false);
    expect(res.reason).toBe("already_registered");
  });
});
