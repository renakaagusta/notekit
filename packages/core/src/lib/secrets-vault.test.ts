import { generateIdentity, identityToRecipient } from "age-encryption";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeviceIdentity } from "./crypto/device-key";
import { generateVaultKey } from "./crypto/keybox";
import {
  generateRecoveryMnemonic,
  recoverySigningFromMnemonic,
  recoveryFromMnemonic,
} from "./crypto/recovery";
import { deviceSigningPayload, sign, toB64 } from "./crypto/signing";
import { encryptSecrets } from "./crypto/vault-crypto";
import {
  CONFIG_PATH,
  DEVICES_PREFIX,
  MEMBERS_PREFIX,
  RECOVERY_PATH,
  SECRETS_PREFIX,
  SHARES_PREFIX,
  addMember,
  collectVaultRecipients,
  configureSecretsBackend,
  configureSecretsCache,
  noopSecretsCache,
  getSecret,
  setSecret,
  setActiveVaultKey,
  unlockVaultKey,
  addDevice,
  removeDevice,
  addSelfToKeybox,
  migrateToEnvelope,
  KEYBOX_PATH,
  deviceRecordTrustedByMember,
  ensureOwnerMember,
  ensureSelfRegistered,
  reEncryptVaultIfMembersChanged,
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

// The secrets module has no built-in cache; tests inject the no-op so any
// scope-dependent read/write path is exercised without throwing.
beforeEach(() => configureSecretsCache(noopSecretsCache));

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

// eslint-disable-next-line max-lines-per-function -- large describe block covering multiple related sub-tests for key-substitution defence
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

// eslint-disable-next-line max-lines-per-function -- large describe block covering member admission scenarios with setup helpers
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- rec is guaranteed by find with deviceId we just registered
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

describe("member recipient reconcile — phase 2 (#14)", () => {
  async function seedMemberVault() {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const a = await recoverySigningFromMnemonic(PHRASE);
    const b = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    files.set(`${MEMBERS_PREFIX}a@x.com.json`, JSON.stringify({ memberId: "a@x.com", signingKey: toB64(a.publicKey), role: "owner", addedAt: "t" }));
    files.set(`${MEMBERS_PREFIX}b@x.com.json`, JSON.stringify({ memberId: "b@x.com", signingKey: toB64(b.publicKey), role: "member", addedAt: "t" }));
    files.set(RECOVERY_PATH, JSON.stringify({ recipient: "age1recovery", createdAt: "t" }));
    const addedAt = "2026-06-04T00:00:00.000Z";
    files.set(`${DEVICES_PREFIX}bdev1.json`, JSON.stringify({
      deviceId: "bdev1", name: "B phone", recipient: "age1bdev1", addedAt, owner: "b@x.com",
      sig: sign(deviceSigningPayload({ deviceId: "bdev1", recipient: "age1bdev1", addedAt, owner: "b@x.com" }), b.privateKey),
    }));
    return { b };
  }

  const reader: DeviceIdentity = {
    deviceId: "bdev1", name: "B phone", identity: "AGE-SECRET-KEY-1B1", recipient: "age1bdev1", createdAt: "t",
  };

  it("no-ops when the recipient set is unchanged, runs when it changed", async () => {
    await seedMemberVault();
    const first = await reEncryptVaultIfMembersChanged(reader, null);
    expect(first.changed).toBe(true); // null → differs
    expect(first.signature).toContain("age1bdev1");

    const again = await reEncryptVaultIfMembersChanged(reader, first.signature);
    expect(again.changed).toBe(false); // same set → skip
    expect(again.signature).toBe(first.signature);
  });

  it("detects the set change when a new member device self-registers (phase 1 → phase 2)", async () => {
    const { b } = await seedMemberVault();
    const before = (await reEncryptVaultIfMembersChanged(reader, null)).signature;

    await ensureSelfRegistered(
      { memberId: "b@x.com" },
      { deviceId: "bdev2", name: "B laptop", identity: "AGE-SECRET-KEY-1B2", recipient: "age1bdev2", createdAt: "t" },
      b,
    );

    const after = await reEncryptVaultIfMembersChanged(reader, before);
    expect(after.changed).toBe(true); // set grew → reconcile fires
    expect(after.signature).toContain("age1bdev2");
  });
});

describe("batched re-encrypt commits — #13", () => {
  it("uses the backend's commitFiles (one commit) instead of per-file writes", async () => {
    const idStr = await generateIdentity();
    const recipient = await identityToRecipient(idStr);
    const signer: DeviceIdentity = {
      deviceId: "sg", name: "Signer", identity: idStr, recipient, createdAt: "t",
    };
    // sanity: the signer can decrypt what we seed
    const { decryptSecrets } = await import("./crypto/vault-crypto");
    const probe = await encryptSecrets(JSON.stringify({ v: 9 }), [recipient]);
    expect(JSON.parse(await decryptSecrets(probe, idStr)).v).toBe(9);

    const { backend, files } = memoryBackend();
    let commitFilesCalls = 0;
    let batchedCount = 0;
    let writeFileCalls = 0;
    const baseWrite = backend.writeFile;
    backend.writeFile = async (...a: Parameters<typeof baseWrite>) => {
      writeFileCalls++;
      return baseWrite(...a);
    };
    backend.commitFiles = async (fs, _msg) => {
      commitFilesCalls++;
      batchedCount += fs.length;
      for (const f of fs) files.set(f.path, f.content);
      return { commitSha: "batch-sha" };
    };
    configureSecretsBackend(backend);

    const a = await recoverySigningFromMnemonic(PHRASE);
    // Recovery recipient must be a REAL age recipient — reEncryptVaultIfMembersChanged
    // actually encrypts to the set, so a placeholder would throw.
    const recoveryRecipient = await identityToRecipient(await generateIdentity());
    files.set(`${MEMBERS_PREFIX}a@x.com.json`, JSON.stringify({ memberId: "a@x.com", signingKey: toB64(a.publicKey), role: "owner", addedAt: "t" }));
    files.set(RECOVERY_PATH, JSON.stringify({ recipient: recoveryRecipient, createdAt: "t" }));
    // Two secrets, encrypted to the signer so it can decrypt + re-seal them.
    files.set(`${SECRETS_PREFIX}k1.age`, await encryptSecrets(JSON.stringify({ v: 1 }), [recipient]));
    files.set(`${SECRETS_PREFIX}k2.age`, await encryptSecrets(JSON.stringify({ v: 2 }), [recipient]));

    const res = await reEncryptVaultIfMembersChanged(signer, null);
    expect(res.changed).toBe(true);
    expect({ commitFilesCalls, batchedCount, writeFileCalls }).toEqual({
      commitFilesCalls: 1,
      batchedCount: 2,
      writeFileCalls: 0,
    });
  });
});

// eslint-disable-next-line max-lines-per-function -- large describe block covering full envelope lifecycle: create, add, revoke, migrate
describe("envelope mode content seam (P2)", () => {
  // The seam is a module global — always clear it so it can't leak into the
  // legacy-mode tests above/below.
  afterEach(() => setActiveVaultKey(null));

  async function mkDevice(id: string): Promise<DeviceIdentity> {
    const identity = await generateIdentity();
    const recipient = await identityToRecipient(identity);
    return { deviceId: id, name: id, identity, recipient, createdAt: "2026-06-01T00:00:00.000Z" };
  }

  it("seals content to the vault key, so any device reads it via V (O(1) add)", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const V = await generateVaultKey();
    setActiveVaultKey(V);

    const devA = await mkDevice("A");
    await setSecret("OPENAI", "sk-123", devA);

    // Stored ciphertext must be sealed to V, not to devA specifically.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- OPENAI secret was just written by setSecret above
    const stored = files.get(`${SECRETS_PREFIX}OPENAI.age`)!;
    expect(stored).toContain("AGE ENCRYPTED FILE");
    expect(await decryptSecretsRaw(stored, V.identity)).toContain("sk-123");

    // A brand-new device never added anywhere still reads it — content is
    // device-independent once the keybox hands over V.
    const devB = await mkDevice("B");
    expect(await getSecret("OPENAI", devB)).toBe("sk-123");
  });

  it("without the vault key (legacy mode), a foreign device cannot read V-sealed content", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const V = await generateVaultKey();
    setActiveVaultKey(V);
    const devA = await mkDevice("A");
    await setSecret("OPENAI", "sk-123", devA);

    // Drop back to legacy mode: getSecret now decrypts with the device identity,
    // which is not a recipient of the V-sealed blob → cannot read.
    setActiveVaultKey(null);
    const foreign = await mkDevice("F");
    await expect(getSecret("OPENAI", foreign)).rejects.toThrow();
  });

  it("initVault(envelope) writes a keybox any listed device can unlock", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const owner = await mkDevice("owner");
    const recoveryRecipient = await identityToRecipient(await generateIdentity());

    await initVault({
      device: owner,
      recoveryRecipient,
      recoverySigning,
      scheme: "envelope",
    });

    expect(files.has(KEYBOX_PATH)).toBe(true);
    expect((await readVaultConfig()).scheme).toBe("envelope");
    const V = await unlockVaultKey(owner);
    expect(V).not.toBeNull();
  });

  it("addDevice is O(1) in envelope mode — content untouched, only the keybox is rewritten", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const owner = await mkDevice("owner");
    const recoveryRecipient = await identityToRecipient(await generateIdentity());
    await initVault({ device: owner, recoveryRecipient, recoverySigning, scheme: "envelope" });

    // Simulate bootstrap: unlock V and install it, then write real content.
    setActiveVaultKey(await unlockVaultKey(owner));
    await setSecret("OPENAI", "sk-123", owner);
    await setSecret("STRIPE", "sk-live", owner);

    // Snapshot every content file + the keybox before adding a device.
    const before = new Map(
      [...files.entries()].filter(([p]) => p.startsWith(SECRETS_PREFIX)),
    );
    const keyboxBefore = files.get(KEYBOX_PATH);

    const newDev = await mkDevice("laptop-2");
    await addDevice(newDev, owner, recoverySigning);

    // Content files are byte-for-byte identical — nothing re-encrypted. O(1).
    for (const [p, content] of before) {
      expect(files.get(p)).toBe(content);
    }
    // The keybox was rewritten (now wraps V for the new device too).
    expect(files.get(KEYBOX_PATH)).not.toBe(keyboxBefore);

    // The freshly-added device can unlock V and read existing content.
    const V2 = await unlockVaultKey(newDev);
    expect(V2).not.toBeNull();
    setActiveVaultKey(V2);
    expect(await getSecret("OPENAI", newDev)).toBe("sk-123");
    expect(await getSecret("STRIPE", newDev)).toBe("sk-live");
  });

  it("addSelfToKeybox lets an owner's new device (holding the phrase) join and read", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const rec = await recoveryFromMnemonic(PHRASE);
    const owner = await mkDevice("owner");
    await initVault({ device: owner, recoveryRecipient: rec.recipient, recoverySigning, scheme: "envelope" });
    setActiveVaultKey(await unlockVaultKey(owner));
    await setSecret("OPENAI", "sk-123", owner);
    const contentBefore = files.get(`${SECRETS_PREFIX}OPENAI.age`);

    // A brand-new device that isn't a keybox recipient yet can't open it...
    const phone = await mkDevice("phone");
    await expect(unlockVaultKey(phone)).rejects.toThrow();

    // ...until it self-adds via the recovery identity (owner holds the phrase).
    const V = await addSelfToKeybox(phone, rec.identity, recoverySigning);
    expect(V).not.toBeNull();

    // Content was NOT re-sealed, and the phone now opens the keybox directly.
    expect(files.get(`${SECRETS_PREFIX}OPENAI.age`)).toBe(contentBefore);
    const V2 = await unlockVaultKey(phone);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- V is the result of addSelfToKeybox which throws rather than returning null
    expect(V2?.identity).toBe(V!.identity);
    setActiveVaultKey(V2);
    expect(await getSecret("OPENAI", phone)).toBe("sk-123");
  });

  it("migrateToEnvelope converts a legacy vault in place, is idempotent, then adds devices O(1)", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const rec = await recoveryFromMnemonic(PHRASE);
    const owner = await mkDevice("owner");

    // Legacy vault (scheme defaults to "multi") — content sealed to devices.
    await initVault({ device: owner, recoveryRecipient: rec.recipient, recoverySigning });
    expect(files.has(KEYBOX_PATH)).toBe(false);
    await setSecret("OPENAI", "sk-legacy", owner);
    expect(await getSecret("OPENAI", owner)).toBe("sk-legacy"); // legacy read

    // Migrate → keybox appears, scheme flips, content now readable via V.
    const V = await migrateToEnvelope(owner, recoverySigning);
    expect(V).not.toBeNull();
    expect(files.has(KEYBOX_PATH)).toBe(true);
    expect((await readVaultConfig()).scheme).toBe("envelope");
    setActiveVaultKey(V);
    expect(await getSecret("OPENAI", owner)).toBe("sk-legacy");

    // Idempotent: a second run just returns the same key, no re-migration.
    const again = await migrateToEnvelope(owner, recoverySigning);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- V was verified non-null earlier in this test
    expect(again?.identity).toBe(V!.identity);

    // Post-migration, a new device joins O(1): content byte-identical.
    const before = files.get(`${SECRETS_PREFIX}OPENAI.age`);
    const laptop = await mkDevice("laptop");
    await addDevice(laptop, owner, recoverySigning);
    expect(files.get(`${SECRETS_PREFIX}OPENAI.age`)).toBe(before);
    setActiveVaultKey(await unlockVaultKey(laptop));
    expect(await getSecret("OPENAI", laptop)).toBe("sk-legacy");
  });

  it("removeDevice rotates the vault key (forward secrecy) in envelope mode", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const rec = await recoveryFromMnemonic(PHRASE);
    const owner = await mkDevice("owner");
    await initVault({ device: owner, recoveryRecipient: rec.recipient, recoverySigning, scheme: "envelope" });
    const V1 = await unlockVaultKey(owner);
    setActiveVaultKey(V1);
    await setSecret("OPENAI", "sk-1", owner);

    // Add a second device (O(1)), which learns the current vault key.
    const laptop = await mkDevice("laptop");
    await addDevice(laptop, owner, recoverySigning);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- V1 was just obtained from unlockVaultKey without throwing
    expect((await unlockVaultKey(laptop))?.identity).toBe(V1!.identity);

    // Revoke it → the vault key rotates.
    await removeDevice(laptop.deviceId, owner, recoverySigning);
    const V2 = await unlockVaultKey(owner);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- V2 and V1 are both valid vault keys obtained without throwing
    expect(V2!.identity).not.toBe(V1!.identity); // new key
    setActiveVaultKey(V2);
    expect(await getSecret("OPENAI", owner)).toBe("sk-1"); // owner still reads

    // The revoked device can't open the keybox (its entry is gone)...
    await expect(unlockVaultKey(laptop)).rejects.toThrow();
    // ...and the OLD key can no longer read the re-sealed content.
    setActiveVaultKey(V1);
    await expect(getSecret("OPENAI", owner)).rejects.toThrow();
  });

  it("full envelope lifecycle: create → add 2 devices → revoke one → survivor reads, revoked locked out", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const rec = await recoveryFromMnemonic(PHRASE);

    // Day 1 — owner creates an envelope vault and writes a secret.
    const owner = await mkDevice("owner");
    await initVault({ device: owner, recoveryRecipient: rec.recipient, recoverySigning, scheme: "envelope" });
    setActiveVaultKey(await unlockVaultKey(owner));
    await setSecret("DEPLOY_KEY", "v1", owner);

    // Day 2 — owner adds a laptop and a phone. Each is O(1): content untouched.
    const contentAfterCreate = files.get(`${SECRETS_PREFIX}DEPLOY_KEY.age`);
    const laptop = await mkDevice("laptop");
    const phone = await mkDevice("phone");
    await addDevice(laptop, owner, recoverySigning);
    await addDevice(phone, owner, recoverySigning);
    expect(files.get(`${SECRETS_PREFIX}DEPLOY_KEY.age`)).toBe(contentAfterCreate); // never re-sealed

    // Both new devices read the existing secret via the keybox.
    for (const d of [laptop, phone]) {
      setActiveVaultKey(await unlockVaultKey(d));
      expect(await getSecret("DEPLOY_KEY", d)).toBe("v1");
    }

    // Day 3 — the laptop is lost; owner revokes it → the vault key rotates.
    setActiveVaultKey(await unlockVaultKey(owner));
    await removeDevice(laptop.deviceId, owner, recoverySigning);

    // The phone (still trusted) keeps working across the rotation...
    setActiveVaultKey(await unlockVaultKey(phone));
    expect(await getSecret("DEPLOY_KEY", phone)).toBe("v1");
    await setSecret("DEPLOY_KEY", "v2", phone); // and can write new content
    expect(await getSecret("DEPLOY_KEY", phone)).toBe("v2");

    // ...while the revoked laptop can no longer open the keybox at all.
    await expect(unlockVaultKey(laptop)).rejects.toThrow();
  });

  it("removeDevice in a signed envelope vault demands the recovery phrase", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const rec = await recoveryFromMnemonic(PHRASE);
    const owner = await mkDevice("owner");
    await initVault({ device: owner, recoveryRecipient: rec.recipient, recoverySigning, scheme: "envelope" });
    setActiveVaultKey(await unlockVaultKey(owner));
    const laptop = await mkDevice("laptop");
    await addDevice(laptop, owner, recoverySigning);
    // No recoverySigning → can't re-sign the rotated keybox → refuse.
    await expect(removeDevice(laptop.deviceId, owner)).rejects.toThrow(/recovery phrase/);
  });
});

async function decryptSecretsRaw(armored: string, identity: string): Promise<string> {
  const { decryptSecrets } = await import("./crypto/vault-crypto");
  return decryptSecrets(armored, identity);
}
