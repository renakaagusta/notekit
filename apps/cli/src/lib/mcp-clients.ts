// MCP client registry + per-client config adapters.
//
// Goal: `notekit mcp install <client>` should know exactly where each
// supported agent IDE keeps its MCP config, what shape that config takes
// (JSON vs TOML, top-level key, command spec), and how to merge a
// `notekit` entry in without clobbering other servers.
//
// Each adapter exposes:
//   - `configPath`       — resolves the OS-specific config file location
//   - `format`           — "json" | "toml"
//   - `serializeEntry`   — produces the raw block a user could paste
//   - `merge`            — applies the entry to existing file contents
//   - `deeplink?`        — optional one-click install URL for IDEs that
//                          support it (Cursor, VS Code MCP, etc.)
//
// The design choice: every adapter takes the same `McpEntry` (name +
// command + args + env) so the install command stays a thin orchestrator.

import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";

export type ClientId =
  | "claude-code"
  | "claude-desktop"
  | "cursor"
  | "codex"
  | "opencode"
  | "continue"
  | "zed"
  | "windsurf";

export interface McpEntry {
  /** Name the server registers under (default: `notekit`). */
  name: string;
  /** Executable to invoke. Defaults to `npx`. */
  command: string;
  /** Arguments to the executable. Defaults to `["-y", "@notekit/mcp"]`. */
  args: string[];
  /** Environment variables (NOTEKIT_API_URL, NOTEKIT_TOKEN, …). */
  env: Record<string, string>;
}

export interface ClientAdapter {
  id: ClientId;
  label: string;
  format: "json" | "toml";
  /** Resolve the absolute config path. May depend on `--project` flag. */
  configPath(opts: { home: string; cwd: string; projectScope?: boolean }): string;
  /** Render the raw block a user could copy/paste. */
  serializeEntry(entry: McpEntry): string;
  /** Merge entry into existing file contents; return the updated content. */
  merge(existing: string | null, entry: McpEntry): string;
  /** One-click install deeplink for clients that support it. */
  deeplink?(entry: McpEntry): string | null;
  /** Human-readable post-install hint (where to restart, what to check). */
  postInstall?: string;
}

// ─── shared helpers ────────────────────────────────────────────────────

function mergeJsonAt(
  existing: string | null,
  keyPath: string[],
  entryName: string,
  entryShape: unknown,
): string {
  const root: Record<string, unknown> = existing
    ? safeParseJson(existing)
    : {};
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < keyPath.length; i++) {
    const k = keyPath[i]!;
    const next = cursor[k];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      const fresh: Record<string, unknown> = {};
      cursor[k] = fresh;
      cursor = fresh;
    } else {
      cursor = next as Record<string, unknown>;
    }
  }
  cursor[entryName] = entryShape;
  return JSON.stringify(root, null, 2) + "\n";
}

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

function jsonCommandShape(entry: McpEntry) {
  // The Claude Desktop / Cursor / Continue / OpenCode shape: command +
  // args + env, all inside one object keyed by server name.
  const out: Record<string, unknown> = {
    command: entry.command,
    args: entry.args,
  };
  if (Object.keys(entry.env).length > 0) out["env"] = { ...entry.env };
  return out;
}

function toTomlSection(serverName: string, entry: McpEntry): string {
  // Codex CLI uses TOML. The grammar we emit is intentionally minimal:
  //
  //   [mcp_servers.<name>]
  //   command = "npx"
  //   args = ["-y", "@notekit/mcp"]
  //
  //   [mcp_servers.<name>.env]
  //   NOTEKIT_API_URL = "..."
  //   NOTEKIT_TOKEN   = "..."
  const head = `[mcp_servers.${serverName}]`;
  const lines: string[] = [head];
  lines.push(`command = ${tomlString(entry.command)}`);
  lines.push(`args = [${entry.args.map(tomlString).join(", ")}]`);
  if (Object.keys(entry.env).length > 0) {
    lines.push("");
    lines.push(`[mcp_servers.${serverName}.env]`);
    for (const [k, v] of Object.entries(entry.env)) {
      lines.push(`${k} = ${tomlString(v)}`);
    }
  }
  return lines.join("\n") + "\n";
}

function tomlString(s: string): string {
  // Basic strings; escape backslashes and double quotes; preserve
  // newlines via \n. Sufficient for env values and command strings.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function mergeTomlSection(
  existing: string | null,
  serverName: string,
  entry: McpEntry,
): string {
  const block = toTomlSection(serverName, entry);
  if (!existing) return block;
  // Drop any prior `[mcp_servers.<name>] … (until next top-level [section] or
  // end of file)` block so we don't double-register.
  const headerRe = new RegExp(
    `(^|\\n)\\[mcp_servers\\.${escapeRegex(serverName)}(\\.[^\\]]+)?\\][^\\n]*(\\n(?!\\[)[^\\n]*)*`,
    "g",
  );
  const stripped = existing.replace(headerRe, "").replace(/\n{3,}/g, "\n\n").trimEnd();
  return (stripped ? stripped + "\n\n" : "") + block;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── adapters ──────────────────────────────────────────────────────────

const claudeDesktopAdapter: ClientAdapter = {
  id: "claude-desktop",
  label: "Claude Desktop",
  format: "json",
  configPath({ home }) {
    switch (platform()) {
      case "darwin":
        return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
      case "win32":
        return path.join(process.env["APPDATA"] ?? home, "Claude", "claude_desktop_config.json");
      default:
        return path.join(home, ".config", "Claude", "claude_desktop_config.json");
    }
  },
  serializeEntry(entry) {
    return JSON.stringify({ mcpServers: { [entry.name]: jsonCommandShape(entry) } }, null, 2) + "\n";
  },
  merge(existing, entry) {
    return mergeJsonAt(existing, ["mcpServers"], entry.name, jsonCommandShape(entry));
  },
  postInstall: "Restart Claude Desktop. The NoteKit tools appear under the 🔨 / hammer icon.",
};

const claudeCodeAdapter: ClientAdapter = {
  id: "claude-code",
  label: "Claude Code",
  format: "json",
  configPath({ home, cwd, projectScope }) {
    return projectScope
      ? path.join(cwd, ".mcp.json")
      : path.join(home, ".claude.json");
  },
  serializeEntry(entry) {
    return JSON.stringify({ mcpServers: { [entry.name]: jsonCommandShape(entry) } }, null, 2) + "\n";
  },
  merge(existing, entry) {
    return mergeJsonAt(existing, ["mcpServers"], entry.name, jsonCommandShape(entry));
  },
  postInstall:
    "Run `claude mcp list` to confirm. Or use the CLI form: `claude mcp add notekit -- npx -y @notekit/mcp`",
};

const cursorAdapter: ClientAdapter = {
  id: "cursor",
  label: "Cursor",
  format: "json",
  configPath({ home, cwd, projectScope }) {
    return projectScope
      ? path.join(cwd, ".cursor", "mcp.json")
      : path.join(home, ".cursor", "mcp.json");
  },
  serializeEntry(entry) {
    return JSON.stringify({ mcpServers: { [entry.name]: jsonCommandShape(entry) } }, null, 2) + "\n";
  },
  merge(existing, entry) {
    return mergeJsonAt(existing, ["mcpServers"], entry.name, jsonCommandShape(entry));
  },
  deeplink(entry) {
    // Cursor accepts a base64 of just the server entry (no wrapper key).
    const payload = JSON.stringify(jsonCommandShape(entry));
    const b64 = Buffer.from(payload, "utf8").toString("base64");
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(entry.name)}&config=${encodeURIComponent(b64)}`;
  },
  postInstall: "Restart Cursor (or reload the MCP panel in Settings → MCP).",
};

const codexAdapter: ClientAdapter = {
  id: "codex",
  label: "Codex CLI",
  format: "toml",
  configPath({ home }) {
    return path.join(home, ".codex", "config.toml");
  },
  serializeEntry(entry) {
    return toTomlSection(entry.name, entry);
  },
  merge(existing, entry) {
    return mergeTomlSection(existing, entry.name, entry);
  },
  postInstall: "Run `codex mcp list` (or restart your Codex CLI session) to confirm.",
};

const openCodeAdapter: ClientAdapter = {
  id: "opencode",
  label: "OpenCode",
  format: "json",
  configPath({ home, cwd, projectScope }) {
    return projectScope
      ? path.join(cwd, "opencode.json")
      : path.join(home, ".config", "opencode", "opencode.json");
  },
  serializeEntry(entry) {
    // OpenCode's shape: { mcp: { <name>: { type: "local", command: [...] , environment: {...} } } }
    const shape = openCodeShape(entry);
    return JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { [entry.name]: shape } }, null, 2) + "\n";
  },
  merge(existing, entry) {
    return mergeJsonAt(existing, ["mcp"], entry.name, openCodeShape(entry));
  },
  postInstall: "Restart OpenCode or run `opencode mcp list`.",
};

function openCodeShape(entry: McpEntry) {
  const out: Record<string, unknown> = {
    type: "local",
    command: [entry.command, ...entry.args],
    enabled: true,
  };
  if (Object.keys(entry.env).length > 0) out["environment"] = { ...entry.env };
  return out;
}

const continueAdapter: ClientAdapter = {
  id: "continue",
  label: "Continue",
  format: "json",
  configPath({ home, cwd, projectScope }) {
    return projectScope
      ? path.join(cwd, ".continue", "config.json")
      : path.join(home, ".continue", "config.json");
  },
  serializeEntry(entry) {
    // Continue uses `experimental.modelContextProtocolServers: [{...}]`
    // (array of objects with a `transport` block). We serialize a
    // standalone snippet here; merge is array-append.
    const item = continueShape(entry);
    return JSON.stringify({ experimental: { modelContextProtocolServers: [item] } }, null, 2) + "\n";
  },
  merge(existing, entry) {
    const root = existing ? safeParseJson(existing) : {};
    const experimental = (typeof root["experimental"] === "object" && root["experimental"]
      ? (root["experimental"] as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const listRaw = experimental["modelContextProtocolServers"];
    const list = Array.isArray(listRaw) ? [...listRaw] : [];
    // Replace any existing entry with the same name.
    const idx = list.findIndex(
      (v) => v && typeof v === "object" && (v as Record<string, unknown>)["name"] === entry.name,
    );
    if (idx === -1) list.push(continueShape(entry));
    else list[idx] = continueShape(entry);
    experimental["modelContextProtocolServers"] = list;
    root["experimental"] = experimental;
    return JSON.stringify(root, null, 2) + "\n";
  },
  postInstall: "Reload Continue (Cmd+Shift+L → Reload Window in VS Code) so it re-reads config.",
};

function continueShape(entry: McpEntry) {
  return {
    name: entry.name,
    transport: {
      type: "stdio",
      command: entry.command,
      args: entry.args,
      ...(Object.keys(entry.env).length > 0 ? { env: { ...entry.env } } : {}),
    },
  };
}

const zedAdapter: ClientAdapter = {
  id: "zed",
  label: "Zed",
  format: "json",
  configPath({ home }) {
    return path.join(home, ".config", "zed", "settings.json");
  },
  serializeEntry(entry) {
    return JSON.stringify({ context_servers: { [entry.name]: zedShape(entry) } }, null, 2) + "\n";
  },
  merge(existing, entry) {
    return mergeJsonAt(existing, ["context_servers"], entry.name, zedShape(entry));
  },
  postInstall: "Zed picks the change up on save; open a project and check the Context Servers panel.",
};

function zedShape(entry: McpEntry) {
  return {
    command: {
      path: entry.command,
      args: entry.args,
      ...(Object.keys(entry.env).length > 0 ? { env: { ...entry.env } } : {}),
    },
  };
}

const windsurfAdapter: ClientAdapter = {
  id: "windsurf",
  label: "Windsurf",
  format: "json",
  configPath({ home }) {
    return path.join(home, ".codeium", "windsurf", "mcp_config.json");
  },
  serializeEntry(entry) {
    return JSON.stringify({ mcpServers: { [entry.name]: jsonCommandShape(entry) } }, null, 2) + "\n";
  },
  merge(existing, entry) {
    return mergeJsonAt(existing, ["mcpServers"], entry.name, jsonCommandShape(entry));
  },
  postInstall: "Restart Windsurf; the server appears under Settings → Cascade → MCP Servers.",
};

// ─── registry ──────────────────────────────────────────────────────────

export const ALL_CLIENTS: ClientAdapter[] = [
  claudeCodeAdapter,
  cursorAdapter,
  codexAdapter,
  openCodeAdapter,
  continueAdapter,
  zedAdapter,
  windsurfAdapter,
  claudeDesktopAdapter,
];

const BY_ID = new Map<ClientId, ClientAdapter>(ALL_CLIENTS.map((c) => [c.id, c]));

export function getClient(id: ClientId): ClientAdapter | undefined {
  return BY_ID.get(id);
}

export function homeDir(): string {
  return homedir();
}

/**
 * Build the canonical NoteKit MCP entry for the active environment.
 *
 * Defaults to invoking the locally-installed `notekit` binary with
 * `mcp serve` — that's the in-process MCP path the Bun-compiled binary
 * exposes. Pass `useNpx: true` to get the legacy `npx -y @notekit/mcp`
 * form (useful once the npm package is published as a fallback).
 *
 * `apiUrl` and `token` come from the CLI config / keychain; we don't
 * inline-bake the token unless the caller asked for it.
 */
export function buildEntry(opts: {
  name?: string;
  apiUrl?: string;
  token?: string;
  command?: string;
  args?: string[];
  /** Force the `npx -y @notekit/mcp` form even when the binary is found. */
  useNpx?: boolean;
}): McpEntry {
  const env: Record<string, string> = {};
  if (opts.apiUrl) env["NOTEKIT_API_URL"] = opts.apiUrl;
  if (opts.token) env["NOTEKIT_TOKEN"] = opts.token;

  // Pick command/args. Explicit overrides win, then useNpx, then
  // auto-detected binary path, then `notekit` (assume PATH).
  let command = opts.command;
  let args = opts.args;
  if (!command) {
    if (opts.useNpx) {
      command = "npx";
      args = args ?? ["-y", "@notekit/mcp"];
    } else {
      command = resolveNotekitBinary();
      args = args ?? ["mcp", "serve"];
    }
  } else if (!args) {
    args = ["mcp", "serve"];
  }

  return {
    name: opts.name ?? "notekit",
    command,
    args,
    env,
  };
}

/**
 * Resolve the absolute path to the `notekit` binary, in priority order:
 *
 *   1. `NOTEKIT_BIN` env var (escape hatch for unusual installs).
 *   2. `process.execPath` if the current process *is* the Bun-compiled
 *      `notekit` binary (single-file executable case).
 *   3. `~/.local/bin/notekit` — where `install.sh` drops it.
 *   4. `/usr/local/bin/notekit` — where the sudo install path drops it.
 *   5. Bare string `"notekit"` — assume it's on the user's PATH.
 *
 * We deliberately return the absolute path when we can find one — IDE
 * configs that hard-code `notekit` are at the mercy of the user's PATH
 * at launch time, which is a frequent source of "the agent says it
 * can't find the tool" bug reports.
 */
export function resolveNotekitBinary(): string {
  const override = process.env["NOTEKIT_BIN"];
  if (override && existsSync(override)) return override;

  // If we're running inside a single-file Bun-compiled binary,
  // process.execPath is that binary. Use it.
  const exe = process.execPath;
  if (exe && /\/notekit$/i.test(exe) && existsSync(exe)) return exe;

  const candidates = [
    path.join(homedir(), ".local", "bin", "notekit"),
    "/usr/local/bin/notekit",
    "/opt/homebrew/bin/notekit",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "notekit";
}
