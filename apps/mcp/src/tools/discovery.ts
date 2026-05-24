// Discovery tools — `recent_activity`, `vault_grep`, `list_directory`.
//
// These are the "navigation" affordances an agent reaches for when it
// hasn't yet narrowed down which file or path it cares about. All three
// are read-only and scope-aware (project-default, with read-everywhere
// fallback). They're grouped here because they share the same shape:
// take an optional path/pattern + scope, fan out over `nk.vault.listFiles`
// or `nk.vault.listCommits`, return a paginated summary.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import {
  encryptedSkippedNote,
  errorContent,
  isEncryptedItemPath,
  jsonContent,
  listVaultFiles,
} from "../lib/notekit.js";
import { resolveProjectContext } from "../lib/project.js";
import { isUnderAnyPrefix, projectOfPath, resolveScope } from "../lib/scope.js";

const SCOPE_VALUES = ["project", "global", "all"] as const;
const KIND_VALUES = ["notes", "tickets", "links", "inbox", "all"] as const;

export function registerDiscoveryTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "recent_activity",
    {
      title: "Recent activity",
      description:
        "List recent Git commits in the active vault. Optionally narrow by `path` (e.g. `projects/notekit/notes/`). Each entry has commit sha, message, author, timestamp, and any file path touched. Use when the user asks 'what changed', 'what did I work on', or 'show recent edits'.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Optional vault path/prefix to narrow by. When omitted and a project marker is active, narrows to `projects/<slug>/`.",
          ),
        limit: z.number().int().min(1).max(200).optional().describe("Max commits (default 25)."),
        scope: z.enum(SCOPE_VALUES).optional(),
        project: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ path, limit, scope, project }) => {
      try {
        const ctx = resolveProjectContext();
        const resolved = resolveScope("notes", { scope, project, ctx });
        // recent_activity uses the project's *root* (`projects/<slug>/`)
        // rather than a per-kind prefix — listCommits already filters by
        // path prefix on the server side.
        const narrow =
          path ??
          (resolved.effective === "project" && resolved.project
            ? `projects/${resolved.project}/`
            : undefined);
        const result = await nk.vault.listCommits({
          path: narrow,
          limit: limit ?? 25,
        });
        return jsonContent({
          count: result.commits.length,
          scope: resolved.effective,
          project: resolved.project,
          narrowedTo: narrow ?? null,
          commits: result.commits,
        });
      } catch (err) {
        return errorContent(`recent_activity failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "vault_grep",
    {
      title: "Grep vault",
      description:
        "Regex / substring search across notes, tickets, links, and inbox in the active scope. Pass `regex: true` for a real RegExp pattern (case-insensitive by default). Use this when `notes_search` is too narrow (it only sees notes) — `vault_grep` covers every Markdown surface and returns matched line + line number.",
      inputSchema: {
        pattern: z.string().min(1).describe("Substring or regex (depending on `regex`)."),
        regex: z
          .boolean()
          .optional()
          .describe("Treat `pattern` as a JavaScript regular expression. Default false."),
        caseSensitive: z.boolean().optional().describe("Match exactly. Default false."),
        kind: z
          .enum(KIND_VALUES)
          .optional()
          .describe("Which surface to search. Default `all`."),
        limit: z.number().int().min(1).max(100).optional().describe("Max hits (default 25)."),
        scope: z.enum(SCOPE_VALUES).optional(),
        project: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ pattern, regex, caseSensitive, kind, limit, scope, project }) => {
      try {
        const ctx = resolveProjectContext();
        const max = limit ?? 25;
        const surfaces = kind && kind !== "all" ? [kind] : (["notes", "tickets", "links", "inbox"] as const);
        let matcher: (line: string) => boolean;
        if (regex) {
          try {
            const flags = caseSensitive ? "" : "i";
            const re = new RegExp(pattern, flags);
            matcher = (line) => re.test(line);
          } catch (err) {
            return errorContent(`vault_grep: invalid regex — ${(err as Error).message}`);
          }
        } else {
          const needle = caseSensitive ? pattern : pattern.toLowerCase();
          matcher = (line) =>
            caseSensitive ? line.includes(needle) : line.toLowerCase().includes(needle);
        }

        const hits: { path: string; line: number; text: string; kind: string }[] = [];
        let encryptedSkipped = 0;
        const seenPaths = new Set<string>();
        outer: for (const surface of surfaces) {
          const resolved = resolveScope(surface, { scope, project, ctx });
          for (const prefix of resolved.readPrefixes) {
            const entries = await listVaultFiles(nk, prefix);
            for (const entry of entries) {
              if (!isUnderAnyPrefix(entry.path, [prefix])) continue;
              if (seenPaths.has(entry.path)) continue;
              seenPaths.add(entry.path);
              if (isEncryptedItemPath(entry.path)) {
                encryptedSkipped++;
                continue;
              }
              if (!entry.path.endsWith(".md")) continue;
              const file = await nk.vault.readFile(entry.path);
              const lines = (file.content ?? "").split("\n");
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i]!;
                if (matcher(line)) {
                  hits.push({
                    path: entry.path,
                    line: i + 1,
                    text: line.length > 200 ? line.slice(0, 200) + "…" : line,
                    kind: surface,
                  });
                  if (hits.length >= max) break outer;
                }
              }
            }
          }
        }
        return jsonContent({
          count: hits.length,
          hits,
          ...(encryptedSkippedNote(encryptedSkipped, "item") ?? {}),
        });
      } catch (err) {
        return errorContent(`vault_grep failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "list_directory",
    {
      title: "List directory",
      description:
        "List entries under a vault path. Returns immediate children (folders + files), useful for browsing without a search query. When no path is given, lists the top-level layout (`notes/`, `tickets/`, `projects/`, etc.). The MCP returns up to 200 entries; use `recursive: true` to descend into the tree.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Vault prefix to list under (e.g. `projects/notekit/notes/`). Defaults to the active project's root, then vault root.",
          ),
        recursive: z.boolean().optional().describe("Include subdirectory entries. Default false."),
        scope: z.enum(SCOPE_VALUES).optional(),
        project: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ path, recursive, scope, project }) => {
      try {
        const ctx = resolveProjectContext();
        const resolved = resolveScope("notes", { scope, project, ctx });
        const root =
          path ??
          (resolved.effective === "project" && resolved.project
            ? `projects/${resolved.project}/`
            : "");
        const entries = await listVaultFiles(nk, root);
        const folders = new Set<string>();
        const files: { path: string; sha: string }[] = [];
        for (const e of entries) {
          const rel = e.path.slice(root.length);
          if (!rel) continue;
          const slash = rel.indexOf("/");
          if (slash === -1) {
            files.push(e);
          } else {
            const dir = rel.slice(0, slash);
            folders.add(dir);
            if (recursive) files.push(e);
          }
        }
        return jsonContent({
          root: root || "/",
          scope: resolved.effective,
          project: resolved.project,
          folders: [...folders].sort(),
          files: files.slice(0, 200).map((f) => ({
            path: f.path,
            sha: f.sha,
            project: projectOfPath(f.path),
          })),
          truncated: files.length > 200,
        });
      } catch (err) {
        return errorContent(`list_directory failed: ${(err as Error).message}`);
      }
    },
  );

}
