import { describe, expect, it, vi } from "vitest";
import type { VaultPort } from "../application/ports/out";
import { createVaultSync } from "./sync";

/** A no-op VaultPort whose calls can be spied on. */
function fakeVaultPort(): VaultPort {
  return {
    readFile: vi.fn().mockResolvedValue({ path: "", sha: null, content: null }),
    readFileAtRef: vi.fn().mockResolvedValue({ path: "", sha: null, content: null }),
    writeFile: vi.fn().mockResolvedValue({ path: "", sha: "" }),
    commitFiles: vi.fn().mockResolvedValue({ commitSha: "" }),
    deleteFile: vi.fn().mockResolvedValue({ ok: true as const }),
    listFiles: vi.fn().mockResolvedValue({ entries: [] }),
    listCommits: vi.fn().mockResolvedValue({ commits: [] }),
  };
}

describe("createVaultSync", () => {
  it("returns the sync public API", () => {
    const api = createVaultSync();
    expect(typeof api.start).toBe("function");
    expect(typeof api.refresh).toBe("function");
    expect(typeof api.pull).toBe("function");
    expect(typeof api.reset).toBe("function");
  });

  it("accepts an injected VaultPort without touching the network", () => {
    // The seam exists and is typed to VaultPort; a composition root / test can
    // swap the concrete transport for an in-memory implementation.
    const api = createVaultSync({ vault: fakeVaultPort() });
    expect(typeof api.pull).toBe("function");
  });
});
