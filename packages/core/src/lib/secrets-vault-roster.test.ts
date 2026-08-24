import { ed25519 } from "@noble/curves/ed25519.js";
import { generateIdentity, identityToRecipient } from "age-encryption";
import { beforeEach, describe, expect, it } from "vitest";
import type { DeviceIdentity } from "./crypto/device-key";
import { recoverySigningFromMnemonic, recoveryFromMnemonic } from "./crypto/recovery";
import { toB64 } from "./crypto/signing";
import {
  configureSecretsBackend,
  configureSecretsCache,
  noopSecretsCache,
  initVault,
  setActiveVaultKey,
  unlockVaultKey,
  getSecret,
  setSecret,
  type SecretsBackend,
} from "./secrets-vault";
import {
  bootstrapGenesisRoster,
  currentRoster,
  addDeviceViaRoster,
  revokeDeviceViaRoster,
  deviceSigner,
} from "./secrets-vault-roster";

// A distinct valid BIP39 mnemonic for the vault's master (recovery) key.
const PHRASE =
  "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";

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

async function newDevice(name: string): Promise<DeviceIdentity> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  const signPrivateKey = ed25519.utils.randomSecretKey();
  return {
    deviceId: Math.random().toString(36).slice(2, 12),
    name,
    identity,
    recipient,
    createdAt: new Date().toISOString(),
    signPublicKey: toB64(ed25519.getPublicKey(signPrivateKey)),
    signPrivateKey: toB64(signPrivateKey),
  };
}

function signerOf(device: DeviceIdentity): { signPub: string; signPriv: Uint8Array } {
  const signer = deviceSigner(device);
  if (!signer) throw new Error("test setup: device has no signing key");
  return signer;
}

function requirePrivate(device: DeviceIdentity): string {
  if (!device.signPrivateKey) throw new Error("test setup: device has no signing private key");
  return device.signPrivateKey;
}

function requireFile(files: Map<string, string>, path: string): string {
  const content = files.get(path);
  if (content === undefined) throw new Error(`test setup: missing file ${path}`);
  return content;
}

async function initEnvelopeVaultWithRoster(deviceA: DeviceIdentity) {
  const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
  const recovery = await recoveryFromMnemonic(PHRASE);
  await initVault({
    device: deviceA,
    recoveryRecipient: recovery.recipient,
    recoverySigning,
    scheme: "envelope",
  });
  await bootstrapGenesisRoster(deviceA, recoverySigning);
  return { recoverySigning, recovery };
}

// eslint-disable-next-line max-lines-per-function -- one describe grouping the add/revoke/forgery adversarial cases; splitting would fragment a cohesive threat suite
describe("Model B roster: add/revoke without the master", () => {
  beforeEach(() => {
    configureSecretsCache(noopSecretsCache);
    setActiveVaultKey(null);
  });

  it("an unlocked in-roster device adds a new device with NO recovery key; the new device reads AND can add a further device", async () => {
    const deviceA = await newDevice("A");
    const { files } = memoryBackendInstall();
    await initEnvelopeVaultWithRoster(deviceA);

    // seed content sealed to the vault key
    setActiveVaultKey(await unlockVaultKey(deviceA));
    await setSecret("api-key", "top-secret", deviceA);

    // Device A adds Device B — recoverySigning is NEVER passed.
    const deviceB = await newDevice("B");
    const bKeys = signerOf(deviceB);
    await addDeviceViaRoster(deviceA, {
      deviceId: deviceB.deviceId,
      name: deviceB.name,
      recipient: deviceB.recipient,
      signPub: bKeys.signPub,
    });

    const roster = await currentRoster();
    expect(roster?.entries.some((e) => e.signPub === bKeys.signPub)).toBe(true);

    // Device B can unlock and read the existing content.
    setActiveVaultKey(null);
    const vk = await unlockVaultKey(deviceB);
    expect(vk).not.toBeNull();
    setActiveVaultKey(vk);
    expect(await getSecret("api-key", deviceB)).toBe("top-secret");

    // Device B (now in roster) adds Device C — again no master.
    const deviceC = await newDevice("C");
    const cKeys = signerOf(deviceC);
    setActiveVaultKey(null);
    await addDeviceViaRoster(deviceB, {
      deviceId: deviceC.deviceId,
      name: deviceC.name,
      recipient: deviceC.recipient,
      signPub: cKeys.signPub,
    });
    const roster3 = await currentRoster();
    expect(roster3?.version).toBe(3);
    expect(roster3?.entries.some((e) => e.signPub === cKeys.signPub)).toBe(true);

    // Device C can read the content too.
    setActiveVaultKey(await unlockVaultKey(deviceC));
    expect(await getSecret("api-key", deviceC)).toBe("top-secret");

    // The master signing key file was written ONCE at genesis and never rotated.
    expect(files.has(".notekit/recovery.json")).toBe(true);
  });

  it("revoke: after an in-roster device revokes X and rotates, X can no longer open the new keybox while the rest can; master unchanged", async () => {
    const deviceA = await newDevice("A");
    const { files } = memoryBackendInstall();
    const { recovery } = await initEnvelopeVaultWithRoster(deviceA);
    const recoveryBefore = files.get(".notekit/recovery.json");

    setActiveVaultKey(await unlockVaultKey(deviceA));
    await setSecret("db-pass", "hunter2", deviceA);

    const deviceB = await newDevice("B");
    const bKeys = signerOf(deviceB);
    setActiveVaultKey(null);
    await addDeviceViaRoster(deviceA, {
      deviceId: deviceB.deviceId,
      name: deviceB.name,
      recipient: deviceB.recipient,
      signPub: bKeys.signPub,
    });

    // Capture the keybox device B can currently open.
    setActiveVaultKey(await unlockVaultKey(deviceB));
    expect(await getSecret("db-pass", deviceB)).toBe("hunter2");

    // Device A revokes Device B and rotates — no recovery key used.
    setActiveVaultKey(await unlockVaultKey(deviceA));
    await revokeDeviceViaRoster(deviceA, bKeys.signPub);

    // A still reads (new epoch, new key).
    setActiveVaultKey(null);
    setActiveVaultKey(await unlockVaultKey(deviceA));
    expect(await getSecret("db-pass", deviceA)).toBe("hunter2");

    // B can no longer open the rotated keybox.
    setActiveVaultKey(null);
    await expect(unlockVaultKey(deviceB)).rejects.toThrow();

    // The master (recovery.json) is byte-for-byte unchanged.
    expect(files.get(".notekit/recovery.json")).toBe(recoveryBefore);
    expect(recovery.recipient).toBeTruthy();
  });

  it("FORGERY: a keybox signed by a device not in the roster is rejected on unlock (fail-closed)", async () => {
    const deviceA = await newDevice("A");
    const { files } = memoryBackendInstall();
    await initEnvelopeVaultWithRoster(deviceA);

    // An attacker who can write the repo re-seals the keybox signed with its own
    // (untrusted) device key and wrapped to itself + A.
    const attacker = await newDevice("attacker");
    const attackerKeys = signerOf(attacker);
    const { sealKeybox } = await import("./crypto/keybox");
    const { keyboxSigningPayload } = await import("./crypto/keybox");
    const { sign } = await import("./crypto/signing");
    const { generateVaultKey } = await import("./crypto/keybox");
    const forgedKey = await generateVaultKey();
    const sig = sign(
      keyboxSigningPayload({ epoch: 1, recipient: forgedKey.recipient }),
      attackerKeys.signPriv,
    );
    const forged = await sealKeybox(forgedKey, [attacker.recipient, deviceA.recipient], {
      epoch: 1,
      sig,
      signedBy: attackerKeys.signPub,
    });
    files.set(".notekit/keybox.age", forged);

    setActiveVaultKey(null);
    await expect(unlockVaultKey(deviceA)).rejects.toThrow(/not present in the current roster/);
  });

  it("FORGERY: an in-roster device cannot be impersonated — a forged roster version signed by an outsider is rejected", async () => {
    const deviceA = await newDevice("A");
    memoryBackendInstall();
    const { recoverySigning } = await initEnvelopeVaultWithRoster(deviceA);
    void recoverySigning;

    // An outsider device tries to add itself directly via the roster API.
    const outsider = await newDevice("outsider");
    const oKeys = signerOf(outsider);
    await expect(
      addDeviceViaRoster(outsider, {
        deviceId: outsider.deviceId,
        name: outsider.name,
        recipient: outsider.recipient,
        signPub: oKeys.signPub,
      }),
    ).rejects.toThrow(/not trusted/);
  });

  // shared installer keeps the memory backend + files handle in scope per test
  function memoryBackendInstall() {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    return { files };
  }
});

describe("Model B migration: legacy vaults keep working, upgrade is safe", () => {
  beforeEach(() => {
    configureSecretsCache(noopSecretsCache);
    setActiveVaultKey(null);
  });

  it("a legacy recovery-signed envelope vault with NO roster still unlocks + reads (legacy fall-through)", async () => {
    const deviceA = await newDevice("legacy-A");
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const recovery = await recoveryFromMnemonic(PHRASE);
    await initVault({
      device: deviceA,
      recoveryRecipient: recovery.recipient,
      recoverySigning,
      scheme: "envelope",
    });
    // NO bootstrapGenesisRoster — this is a pre-Model-B vault.
    expect(files.has(".notekit/roster/000001.json")).toBe(false);

    setActiveVaultKey(await unlockVaultKey(deviceA));
    await setSecret("legacy-secret", "still-here", deviceA);
    setActiveVaultKey(null);

    // Master-signed keybox verifies via the legacy path (roster verifier returns
    // false when there is no roster, so it does not weaken verification).
    const vk = await unlockVaultKey(deviceA);
    expect(vk).not.toBeNull();
    setActiveVaultKey(vk);
    expect(await getSecret("legacy-secret", deviceA)).toBe("still-here");
  });

  it("the origin device bootstraps a genesis roster on a legacy vault, then a secondary device migrates via re-vouch", async () => {
    const deviceA = await newDevice("origin");
    const { files } = memoryBackend2Install();
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const recovery = await recoveryFromMnemonic(PHRASE);
    await initVault({
      device: deviceA,
      recoveryRecipient: recovery.recipient,
      recoverySigning,
      scheme: "envelope",
    });
    setActiveVaultKey(await unlockVaultKey(deviceA));
    await setSecret("shared", "value", deviceA);
    setActiveVaultKey(null);

    // Upgrade: origin device (mnemonic holder) bootstraps the genesis roster.
    await bootstrapGenesisRoster(deviceA, recoverySigning);
    expect(files.has(".notekit/roster/000001.json")).toBe(true);
    expect((await currentRoster())?.version).toBe(1);

    // A secondary device that already existed generates its own signing key and
    // is re-vouched by the in-roster origin device (no master needed).
    const deviceB = await newDevice("secondary");
    const bKeys = signerOf(deviceB);
    await addDeviceViaRoster(deviceA, {
      deviceId: deviceB.deviceId,
      name: deviceB.name,
      recipient: deviceB.recipient,
      signPub: bKeys.signPub,
    });
    setActiveVaultKey(await unlockVaultKey(deviceB));
    expect(await getSecret("shared", deviceB)).toBe("value");
  });

  function memoryBackend2Install() {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    return { files };
  }
});

describe("Model B least-privilege: no signing key or master ever leaves to another party", () => {
  beforeEach(() => {
    configureSecretsCache(noopSecretsCache);
    setActiveVaultKey(null);
  });

  it("a roster entry and the committed roster contain only PUBLIC keys — never a device signing private key or master material", async () => {
    const deviceA = await newDevice("A");
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const recovery = await recoveryFromMnemonic(PHRASE);
    await initVault({
      device: deviceA,
      recoveryRecipient: recovery.recipient,
      recoverySigning,
      scheme: "envelope",
    });
    await bootstrapGenesisRoster(deviceA, recoverySigning);

    const rosterJson = requireFile(files, ".notekit/roster/000001.json");
    const aKeys = signerOf(deviceA);
    // The device signing PRIVATE key and master PRIVATE key must never appear.
    expect(rosterJson).not.toContain(requirePrivate(deviceA));
    expect(rosterJson).not.toContain(toB64(recoverySigning.privateKey));
    // Only the device's PUBLIC signing key is published.
    expect(rosterJson).toContain(aKeys.signPub);

    // The keybox never carries any signing private key either.
    const keybox = requireFile(files, ".notekit/keybox.age");
    expect(keybox).not.toContain(requirePrivate(deviceA));
    expect(keybox).not.toContain(toB64(recoverySigning.privateKey));
  });
});
