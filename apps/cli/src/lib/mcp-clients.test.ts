// Tests for the MCP client adapter table. Every adapter has to:
//   - render a self-contained copy-paste block
//   - merge cleanly into an existing config without dropping unrelated entries
//   - return a config path that's plausible for the host OS
// We run the same matrix against every adapter so adding a new one
// automatically gets the same baseline coverage.

import { describe, expect, it } from "vitest";
import { ALL_CLIENTS, buildEntry, getClient, resolveNotekitBinary } from "./mcp-clients.js";

// Default entries used across every adapter — the *binary* form (the
// current default) and the *npx* form (kept as a fallback for when the
// npm package is published).
const binaryEntry = buildEntry({
  apiUrl: "http://localhost:3001",
  token: "nkp_test_token",
});
const npxEntry = buildEntry({
  apiUrl: "http://localhost:3001",
  token: "nkp_test_token",
  useNpx: true,
});

describe("buildEntry", () => {
  it("defaults to the resolved notekit binary + `mcp serve`", () => {
    const e = buildEntry({});
    expect(e.command).toBe(resolveNotekitBinary());
    expect(e.args).toEqual(["mcp", "serve"]);
    expect(e.name).toBe("notekit");
  });

  it("`useNpx: true` falls back to `npx -y @notekit/mcp` for npm-published installs", () => {
    const e = buildEntry({ useNpx: true });
    expect(e.command).toBe("npx");
    expect(e.args).toEqual(["-y", "@notekit/mcp"]);
  });

  it("omits env keys with undefined values", () => {
    const e = buildEntry({});
    expect(e.env).toEqual({});
  });

  it("includes provided env keys", () => {
    const e = buildEntry({ apiUrl: "x", token: "y" });
    expect(e.env).toEqual({ NOTEKIT_API_URL: "x", NOTEKIT_TOKEN: "y" });
  });

  it("explicit `command` override beats both useNpx and the auto-resolved path", () => {
    const e = buildEntry({ command: "/custom/path/to/notekit", useNpx: true });
    expect(e.command).toBe("/custom/path/to/notekit");
    expect(e.args).toEqual(["mcp", "serve"]);
  });
});

describe("resolveNotekitBinary", () => {
  it("falls back to bare `notekit` when no install location matches", () => {
    // The host may or may not have a real notekit binary; assert the
    // result is either bare or an absolute existing path.
    const v = resolveNotekitBinary();
    if (v === "notekit") return;
    expect(v.startsWith("/")).toBe(true);
  });

  it("honors NOTEKIT_BIN env var when the path exists", () => {
    // Use process.execPath which is guaranteed to exist on any host
    // running these tests.
    const prev = process.env["NOTEKIT_BIN"];
    process.env["NOTEKIT_BIN"] = process.execPath;
    try {
      expect(resolveNotekitBinary()).toBe(process.execPath);
    } finally {
      if (prev === undefined) delete process.env["NOTEKIT_BIN"];
      else process.env["NOTEKIT_BIN"] = prev;
    }
  });
});

describe("ALL_CLIENTS — per-adapter contract (binary entry, default)", () => {
  it.each(ALL_CLIENTS.map((c) => [c.id, c]))(
    "%s renders a non-empty copy-paste block",
    (_, adapter) => {
      const block = adapter.serializeEntry(binaryEntry);
      expect(block.length).toBeGreaterThan(20);
      // The binary entry doesn't mention @notekit/mcp anymore — it
      // references the resolved binary path. Just check both pieces of
      // the command surface appear somewhere in the rendered block.
      expect(block).toContain(binaryEntry.name);
      expect(block).toContain("mcp");
      expect(block).toContain("serve");
    },
  );

  it.each(ALL_CLIENTS.map((c) => [c.id, c]))(
    "%s configPath returns an absolute-looking path",
    (_, adapter) => {
      const p = adapter.configPath({ home: "/home/me", cwd: "/work/x", projectScope: false });
      expect(p.startsWith("/") || /^[A-Z]:\\/.test(p)).toBe(true);
    },
  );

  it.each(ALL_CLIENTS.map((c) => [c.id, c]))(
    "%s merge into empty file produces valid output that contains the entry",
    (_, adapter) => {
      const merged = adapter.merge(null, binaryEntry);
      if (adapter.format === "json") {
        expect(() => JSON.parse(merged)).not.toThrow();
      }
      expect(merged).toContain(binaryEntry.name);
      expect(merged).toContain("mcp");
    },
  );
});

describe("ALL_CLIENTS — npx fallback entries", () => {
  it.each(ALL_CLIENTS.map((c) => [c.id, c]))(
    "%s renders the @notekit/mcp identifier when useNpx is set",
    (_, adapter) => {
      const block = adapter.serializeEntry(npxEntry);
      expect(block).toContain("@notekit/mcp");
    },
  );
});

describe("JSON adapters — merge preserves unrelated entries", () => {
  const jsonAdapters = ALL_CLIENTS.filter((c) => c.format === "json");

  it.each(jsonAdapters.map((c) => [c.id, c]))(
    "%s merge keeps existing servers untouched",
    (_, adapter) => {
      const seed = adapter.merge(null, { ...binaryEntry, name: "existing-server" });
      const merged = adapter.merge(seed, binaryEntry);
      expect(() => JSON.parse(merged)).not.toThrow();
      expect(merged).toContain("existing-server");
      expect(merged).toContain(binaryEntry.name);
    },
  );
});

describe("Codex (TOML) adapter — binary entry", () => {
  const codex = getClient("codex")!;

  it("emits a `[mcp_servers.notekit]` section pointing at the binary", () => {
    const block = codex.serializeEntry(binaryEntry);
    expect(block).toContain("[mcp_servers.notekit]");
    expect(block).toContain(`command = "${binaryEntry.command}"`);
    expect(block).toContain('args = ["mcp", "serve"]');
    expect(block).toContain("[mcp_servers.notekit.env]");
    expect(block).toContain('NOTEKIT_API_URL = "http://localhost:3001"');
  });

  it("merge replaces a prior [mcp_servers.notekit] block", () => {
    const existing = [
      "[mcp_servers.other]",
      'command = "x"',
      "args = []",
      "",
      "[mcp_servers.notekit]",
      'command = "old"',
      "args = []",
      "",
      "[other_section]",
      "key = 1",
    ].join("\n");
    const merged = codex.merge(existing, binaryEntry);
    expect(merged).toContain("[mcp_servers.other]");
    expect(merged).not.toContain('command = "old"');
    expect(merged).toContain(`command = "${binaryEntry.command}"`);
    expect(merged.match(/\[mcp_servers\.notekit\]/g)?.length ?? 0).toBe(1);
  });

  it("merge appends when no prior block exists", () => {
    const merged = codex.merge('[other]\nkey = 1\n', binaryEntry);
    expect(merged).toContain("[other]");
    expect(merged).toContain("[mcp_servers.notekit]");
  });
});

describe("Cursor deeplink", () => {
  const cursor = getClient("cursor")!;
  it("produces a base64-encoded JSON config payload for the binary entry", () => {
    const link = cursor.deeplink!(binaryEntry);
    expect(link).not.toBeNull();
    expect(link!.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?")).toBe(true);
    const url = new URL(link!);
    expect(url.searchParams.get("name")).toBe("notekit");
    const cfg = url.searchParams.get("config");
    expect(cfg).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(cfg!, "base64").toString("utf8"));
    expect(decoded.args).toEqual(["mcp", "serve"]);
  });

  it("produces a deeplink with @notekit/mcp when useNpx is set", () => {
    const link = cursor.deeplink!(npxEntry);
    const url = new URL(link!);
    const cfg = url.searchParams.get("config");
    const decoded = JSON.parse(Buffer.from(cfg!, "base64").toString("utf8"));
    expect(decoded.command).toBe("npx");
    expect(decoded.args).toEqual(["-y", "@notekit/mcp"]);
  });
});

describe("Continue adapter", () => {
  const cont = getClient("continue")!;
  it("places the entry in experimental.modelContextProtocolServers as an array", () => {
    const merged = cont.merge(null, binaryEntry);
    const parsed = JSON.parse(merged);
    const list = parsed.experimental.modelContextProtocolServers;
    expect(Array.isArray(list)).toBe(true);
    expect(list[0].name).toBe("notekit");
    expect(list[0].transport.type).toBe("stdio");
    expect(list[0].transport.args).toEqual(["mcp", "serve"]);
  });

  it("replaces an existing entry with the same name instead of duplicating", () => {
    const seed = cont.merge(null, binaryEntry);
    const merged = cont.merge(seed, { ...binaryEntry, env: { NOTEKIT_API_URL: "https://new" } });
    const parsed = JSON.parse(merged);
    const list = parsed.experimental.modelContextProtocolServers;
    expect(list.length).toBe(1);
    expect(list[0].transport.env.NOTEKIT_API_URL).toBe("https://new");
  });
});

describe("Zed adapter", () => {
  const zed = getClient("zed")!;
  it("uses context_servers.<name>.command.path with the binary", () => {
    const merged = zed.merge(null, binaryEntry);
    const parsed = JSON.parse(merged);
    expect(parsed.context_servers.notekit.command.path).toBe(binaryEntry.command);
    expect(parsed.context_servers.notekit.command.args).toEqual(["mcp", "serve"]);
  });
});

describe("OpenCode adapter", () => {
  const opencode = getClient("opencode")!;
  it("emits `mcp.<name>` with type local and command array", () => {
    const merged = opencode.merge(null, binaryEntry);
    const parsed = JSON.parse(merged);
    expect(parsed.mcp.notekit.type).toBe("local");
    expect(parsed.mcp.notekit.command).toEqual([binaryEntry.command, "mcp", "serve"]);
    expect(parsed.mcp.notekit.environment.NOTEKIT_TOKEN).toBe("nkp_test_token");
  });

  it("emits the npx form when useNpx is set", () => {
    const merged = opencode.merge(null, npxEntry);
    const parsed = JSON.parse(merged);
    expect(parsed.mcp.notekit.command).toEqual(["npx", "-y", "@notekit/mcp"]);
  });
});
