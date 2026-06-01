import { beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_PATH,
  RECOVERY_PATH,
  configureSecretsBackend,
  initVault,
  readVaultConfig,
  type SecretsBackend,
} from "./secrets-vault";
import type { DeviceIdentity } from "./crypto/device-key";

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
