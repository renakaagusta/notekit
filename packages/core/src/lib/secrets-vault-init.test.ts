import { ed25519 } from "@noble/curves/ed25519.js";
import { generateIdentity, identityToRecipient } from "age-encryption";
import { beforeEach, describe, expect, it } from "vitest";
import type { DeviceIdentity } from "./crypto/device-key";
import { recoveryFromMnemonic, recoverySigningFromMnemonic } from "./crypto/recovery";
import { toB64 } from "./crypto/signing";
import {
  configureSecretsBackend,
  configureSecretsCache,
  noopSecretsCache,
  initVault,
  initVaultWithPerDeviceApprovals,
  readVaultConfig,
  setActiveVaultKey,
  unlockVaultKey,
  getSecret,
  setSecret,
  type SecretsBackend,
} from "./secrets-vault";
import { currentRoster, deviceSigner, rosterExists } from "./secrets-vault-roster";

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

describe("initVaultWithPerDeviceApprovals (opt-in Model B creation)", () => {
  beforeEach(() => {
    configureSecretsCache(noopSecretsCache);
    setActiveVaultKey(null);
  });

  it("creates an envelope vault with a genesis roster trusting the origin device", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const device = await newDevice("origin");
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const recovery = await recoveryFromMnemonic(PHRASE);

    await initVaultWithPerDeviceApprovals({
      device,
      recoveryRecipient: recovery.recipient,
      recoverySigning,
    });

    const config = await readVaultConfig();
    expect(config.scheme).toBe("envelope");
    expect(config.encryption).toBe("required");

    const roster = await currentRoster();
    expect(roster).not.toBeNull();
    const signPub = deviceSigner(device)?.signPub;
    expect(roster?.entries.some((e) => e.signPub === signPub)).toBe(true);

    // The origin device can unlock and use the vault with no master phrase.
    setActiveVaultKey(await unlockVaultKey(device));
    await setSecret("api-key", "top-secret", device);
    expect(await getSecret("api-key", device)).toBe("top-secret");
  });

  it("leaves initVault's default path unchanged: no roster, no envelope scheme", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    const device = await newDevice("origin");
    const recovery = await recoveryFromMnemonic(PHRASE);

    // The default initVault call — no scheme argument — must NOT create a roster
    // and must NOT switch to envelope. This guards the "default stays multi"
    // invariant at the core op the opt-in path is built on.
    await initVault({
      device,
      recoveryRecipient: recovery.recipient,
      recoverySigning: await recoverySigningFromMnemonic(PHRASE),
    });

    const config = await readVaultConfig();
    expect(config.scheme).toBeUndefined();
    expect(await rosterExists()).toBe(false);
  });
});
