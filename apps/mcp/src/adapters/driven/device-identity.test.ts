import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMcpDeviceIdentity } from "./device-identity.js";

describe("loadMcpDeviceIdentity", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "notekit-mcp-device-"));
    file = join(dir, "nested", "mcp-device.json");
    process.env["NOTEKIT_DEVICE_IDENTITY_FILE"] = file;
  });

  afterEach(async () => {
    delete process.env["NOTEKIT_DEVICE_IDENTITY_FILE"];
    await rm(dir, { recursive: true, force: true });
  });

  it("mints a persistent identity with a Model B signing keypair on first run", async () => {
    const device = await loadMcpDeviceIdentity();
    expect(device.deviceId).toMatch(/^mcp-/);
    expect(device.name).toBe("notekit-mcp");
    expect(device.recipient.startsWith("age1")).toBe(true);
    expect(typeof device.signPublicKey).toBe("string");
    expect(typeof device.signPrivateKey).toBe("string");
    // It was written to the configured file (private key stays local, on disk).
    const onDisk = JSON.parse(await readFile(file, "utf8"));
    expect(onDisk.deviceId).toBe(device.deviceId);
  });

  it("reuses the same identity across restarts (stable roster identity)", async () => {
    const first = await loadMcpDeviceIdentity();
    const second = await loadMcpDeviceIdentity();
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.signPublicKey).toBe(first.signPublicKey);
    expect(second.signPrivateKey).toBe(first.signPrivateKey);
  });

  it("back-fills a signing keypair for an identity file written before Model B", async () => {
    // Write to a path with no nested parent so the pre-seeded file exists.
    file = join(dir, "mcp-device.json");
    process.env["NOTEKIT_DEVICE_IDENTITY_FILE"] = file;
    await writeFile(
      file,
      JSON.stringify({
        deviceId: "mcp-legacy",
        name: "notekit-mcp",
        identity: "AGE-SECRET-KEY-FAKE",
        recipient: "age1fake",
        createdAt: "2024-01-01T00:00:00.000Z",
      }),
    );
    const device = await loadMcpDeviceIdentity();
    expect(device.deviceId).toBe("mcp-legacy");
    expect(typeof device.signPublicKey).toBe("string");
    expect(typeof device.signPrivateKey).toBe("string");
    // Persisted, so the next load is stable.
    const reloaded = await loadMcpDeviceIdentity();
    expect(reloaded.signPublicKey).toBe(device.signPublicKey);
  });
});
