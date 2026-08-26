import { beforeEach, describe, expect, it, vi } from "vitest";
import { shaCache, syncShaCacheScope } from "./secrets-vault-core";
import { currentVaultScope } from "./vault-persistence";

// `currentVaultScope` is the only thing the scope guard reads; mocking it lets
// us simulate an in-app vault switch without loading the store/persistence graph.
vi.mock("./vault-persistence", () => ({ currentVaultScope: vi.fn() }));

const scope = vi.mocked(currentVaultScope);

describe("shaCache is bound to the active vault scope", () => {
  beforeEach(() => shaCache.clear());

  it("drops another vault's sha when the active vault changes (the cross-vault PUT-500 bug)", () => {
    scope.mockReturnValue("vault-A");
    syncShaCacheScope();
    // Reading a device record in vault A caches its sha.
    shaCache.set(".notekit/devices/cli-x.json", "sha-from-A");

    // In-app switch to vault B (no reload).
    scope.mockReturnValue("vault-B");
    syncShaCacheScope();

    // The stale sha is gone — a write in B now creates (POST) instead of
    // UPDATE-ing a file that doesn't exist there.
    expect(shaCache.has(".notekit/devices/cli-x.json")).toBe(false);
  });

  it("keeps shas while the active vault is unchanged", () => {
    scope.mockReturnValue("vault-A");
    syncShaCacheScope();
    shaCache.set(".notekit/config.json", "sha-cfg");
    syncShaCacheScope(); // same scope — no clear
    expect(shaCache.get(".notekit/config.json")).toBe("sha-cfg");
  });
});
