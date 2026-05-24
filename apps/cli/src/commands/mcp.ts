// `notekit mcp <sub>` — serve, install, doctor.
//
// - `serve`   runs the MCP server in-process via @notekit/mcp's runMcpServer.
//             For the Bun-compiled binary this means zero spawn, ~20ms cold.
// - `install` writes the right MCP config for a given client IDE.
// - `doctor`  checks that the API + token + active vault are healthy so the
//             user can debug "the agent says it can't see my notes".
//
// install always prints the copy-paste block + deeplink fallback (per
// docs/MCP_DISTRIBUTION.md §4.B "decided 2026-05-21"), even when it
// successfully wrote the config, so the user has an audit trail and a
// recovery path if anything looks off.

import { defineCommand } from "citty";
import kleur from "kleur";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

import { runMcpServer } from "@notekit/mcp/run";

import { getClient } from "../client.js";
import { loadConfig } from "../config.js";
import { getToken } from "../keychain.js";
import {
  ALL_CLIENTS,
  buildEntry,
  getClient as getClientAdapter,
  resolveNotekitBinary,
  type ClientAdapter,
  type ClientId,
} from "../lib/mcp-clients.js";

const serveCmd = defineCommand({
  meta: {
    name: "serve",
    description: "Start the NoteKit MCP server on stdio (for Claude Code, Cursor, etc.).",
  },
  args: {
    sse: {
      type: "boolean",
      description: "Serve over SSE on --port instead of stdio.",
      required: false,
    },
    port: {
      type: "string",
      description: "Port to bind for --sse (default 4111).",
      required: false,
    },
  },
  async run({ args }) {
    const cfg = await loadConfig();
    const token = await getToken();
    if (!token) {
      process.stderr.write(
        kleur.red("Not signed in. Run `notekit auth login` first.\n"),
      );
      process.exitCode = 1;
      return;
    }

    // Pass these via env too, in case any deep dependency reads them
    // (parity with the historical standalone-binary entrypoint).
    process.env["NOTEKIT_API_URL"] = cfg.apiUrl;
    process.env["NOTEKIT_TOKEN"] = token;

    try {
      await runMcpServer({
        baseUrl: cfg.apiUrl,
        token,
        transport: args.sse ? "sse" : "stdio",
        port: args.port ? Number(args.port) : undefined,
        sseHost: process.env["NOTEKIT_MCP_SSE_HOST"],
        sseSecret: process.env["NOTEKIT_MCP_SSE_SECRET"],
      });
    } catch (err) {
      process.stderr.write(
        kleur.red(`MCP server crashed: ${(err as Error).stack ?? err}\n`),
      );
      process.exit(1);
    }
  },
});

const installCmd = defineCommand({
  meta: {
    name: "install",
    description:
      "Write the NoteKit MCP entry into a client's config (Claude Code, Cursor, Codex, OpenCode, Continue, Zed, Windsurf, Claude Desktop).",
  },
  args: {
    client: {
      type: "positional",
      description: "Client id. Omit to list options.",
      required: false,
    },
    project: {
      type: "boolean",
      description: "Write project-scoped config (e.g. .cursor/mcp.json in cwd) when the client supports it.",
      required: false,
    },
    printOnly: {
      type: "boolean",
      description: "Don't write any files — just print the config block + deeplink.",
      required: false,
    },
    inlineToken: {
      type: "boolean",
      description: "Inline the bearer token into the env block. Default: only NOTEKIT_API_URL is written.",
      required: false,
    },
    name: {
      type: "string",
      description: "Override the MCP server name (default `notekit`).",
      required: false,
    },
    useNpx: {
      type: "boolean",
      description: "Write `npx -y @notekit/mcp` instead of the absolute binary path. Useful when the npm package is published.",
      required: false,
    },
  },
  async run({ args }) {
    if (!args.client) {
      process.stdout.write(kleur.bold("notekit mcp install <client>\n\n"));
      process.stdout.write("Supported clients:\n");
      for (const c of ALL_CLIENTS) {
        process.stdout.write(`  ${kleur.cyan(c.id.padEnd(16))} ${c.label}\n`);
      }
      process.stdout.write(
        "\nExample:  notekit mcp install cursor --project\n" +
          "          notekit mcp install claude-desktop\n",
      );
      return;
    }
    const adapter = getClientAdapter(String(args.client) as ClientId);
    if (!adapter) {
      process.stderr.write(
        kleur.red(`Unknown client "${args.client}". Run \`notekit mcp install\` (no args) to list options.\n`),
      );
      process.exitCode = 1;
      return;
    }

    const cfg = await loadConfig();
    const token = args.inlineToken ? await getToken() : undefined;
    if (args.inlineToken && !token) {
      process.stderr.write(
        kleur.yellow(
          "Warning: --inline-token requested but no token in the keychain. Falling back to env-only config.\n",
        ),
      );
    }

    const entry = buildEntry({
      name: args.name ? String(args.name) : undefined,
      apiUrl: cfg.apiUrl,
      token: token ?? undefined,
      useNpx: Boolean(args.useNpx),
    });
    const configPath = adapter.configPath({
      home: homedir(),
      cwd: process.cwd(),
      projectScope: Boolean(args.project),
    });
    const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
    const merged = adapter.merge(existing, entry);

    if (!args.printOnly) {
      mkdirSync(path.dirname(configPath), { recursive: true });
      writeFileSync(configPath, merged, "utf8");
      process.stdout.write(
        `${kleur.green("✓")} wrote ${kleur.cyan(adapter.label)} config → ${kleur.dim(configPath)}\n`,
      );
    } else {
      process.stdout.write(kleur.yellow("(--print-only — nothing written)\n"));
      process.stdout.write(`Target file would be: ${kleur.dim(configPath)}\n`);
    }

    // Always print the copy-paste block + deeplink, per
    // docs/MCP_DISTRIBUTION.md §4.B. Saves the user when the auto-merge
    // produces something unexpected, and serves as a permanent recipe.
    process.stdout.write("\n" + kleur.bold(`${adapter.label} — copy-paste block:\n`));
    process.stdout.write(kleur.dim("─".repeat(60)) + "\n");
    process.stdout.write(adapter.serializeEntry(entry));
    process.stdout.write(kleur.dim("─".repeat(60)) + "\n");

    const deeplink = adapter.deeplink?.(entry);
    if (deeplink) {
      process.stdout.write(`${kleur.bold("One-click deeplink:")} ${deeplink}\n`);
    }
    if (adapter.postInstall) {
      process.stdout.write(`\n${kleur.bold("Next:")} ${adapter.postInstall}\n`);
    }
    if (!args.inlineToken && !token) {
      process.stdout.write(
        "\n" +
          kleur.yellow(
            "Heads up: NOTEKIT_TOKEN is not set in the config. The MCP server needs a bearer token.\n" +
              "  - Easiest: rerun with `--inline-token` once you've signed in (`notekit auth login`).\n" +
              "  - Or set NOTEKIT_TOKEN in your shell before launching the client.\n",
          ),
      );
    }
  },
});

const doctorCmd = defineCommand({
  meta: {
    name: "doctor",
    description: "Diagnose your NoteKit MCP setup — token, API reachability, vault count.",
  },
  async run() {
    let ok = true;
    const cfg = await loadConfig();
    process.stdout.write(`${kleur.bold("API URL:")} ${cfg.apiUrl}\n`);

    const token = await getToken();
    if (!token) {
      process.stdout.write(`${kleur.red("✗")} no bearer token in the OS keychain.\n`);
      process.stdout.write(`  Fix: ${kleur.cyan("notekit auth login")}\n`);
      ok = false;
    } else {
      process.stdout.write(`${kleur.green("✓")} bearer token present in keychain.\n`);
    }

    if (token) {
      try {
        const nk = await getClient({ requireAuth: true });
        const list = await nk.vault.listVaults();
        process.stdout.write(
          `${kleur.green("✓")} API reachable. ${list.vaults.length} vault${list.vaults.length === 1 ? "" : "s"} accessible.\n`,
        );
        if (list.activeId) {
          process.stdout.write(`  active vault: ${kleur.cyan(list.activeId)}\n`);
        }
      } catch (err) {
        process.stdout.write(`${kleur.red("✗")} API request failed: ${(err as Error).message}\n`);
        ok = false;
      }
    }

    // The MCP server now runs in-process inside the notekit binary, so
    // there's nothing to "find" — we just report the binary itself so the
    // user knows what `notekit mcp install <client>` will write.
    const binary = resolveNotekitBinary();
    process.stdout.write(
      `${kleur.green("✓")} notekit binary at ${kleur.dim(binary)}\n` +
        `  install will write \`${binary} mcp serve\` into client configs.\n`,
    );

    if (ok) {
      process.stdout.write(kleur.green("\nYou're good. Now run `notekit mcp install <client>`.\n"));
    } else {
      process.exitCode = 1;
    }
  },
});

export const mcpCommand = defineCommand({
  meta: { name: "mcp", description: "Run, install, and diagnose the NoteKit MCP server." },
  subCommands: { serve: serveCmd, install: installCmd, doctor: doctorCmd },
});

