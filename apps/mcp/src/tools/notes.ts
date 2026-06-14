// Notes tools — search, read, create, update notes in the active vault.
// Notes are stored as Markdown files with YAML frontmatter; their paths
// depend on the resolved scope:
//
//   - scope=project (default when a `.notekit` marker is present):
//       writes go to `projects/<slug>/notes/<file>.md`
//       reads search there first, then top-level `notes/` (read-everywhere)
//   - scope=global: top-level `notes/` only
//   - scope=all:    everywhere under `notes/` and `projects/*/notes/`
//
// See `lib/scope.ts` for the exact prefix tables.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import {
  encryptedSkippedNote,
  errorContent,
  isEncryptedItemPath,
  jsonContent,
  listVaultFiles,
  textContent,
} from "../lib/notekit.js";
import { parseMarkdown, serializeMarkdown } from "../lib/markdown.js";
import { resolveProjectContext } from "../lib/project.js";
import { isUnderAnyPrefix, resolveScope } from "../lib/scope.js";
import { randomBytes } from "node:crypto";
import { vaultIsEncrypted, encryptNote, decryptNote } from "../lib/crypto.js";
import type { Note } from "@notekit/core/types";

function newItemId(): string {
  return randomBytes(8).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
}

const SCOPE_VALUES = ["project", "global", "all"] as const;

const scopeSchema = z
  .enum(SCOPE_VALUES)
  .optional()
  .describe(
    "Where to look. `project` (default) scopes to the active `.notekit` project, with fallback reads from top-level notes. `global` is top-level only. `all` is everything.",
  );

const projectSchema = z
  .string()
  .optional()
  .describe(
    "Override the active project slug for this call. Implies `scope` defaults to `project`.",
  );

export function registerNoteTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "notes_search",
    {
      title: "Search notes",
      description:
        "Search notes in the user's selected NoteKit vault. Returns matching notes with path, title, and a short snippet. Use this BEFORE notes_read when the user describes content rather than naming a specific file. Matching is case-insensitive substring against title, tags, and body. Scope-aware: by default searches the active project's notes first then global notes; pass `scope: \"all\"` to span every project.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe("Search query — matches against note title, tags, and body."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results to return (default 10)."),
        scope: scopeSchema,
        project: projectSchema,
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, limit, scope, project }) => {
      const max = limit ?? 10;
      // Cap the candidate read fan-out so an LLM eagerly calling search on
      // a large vault doesn't trigger thousands of API round-trips. The
      // factor of 5 leaves headroom past `max` so frontmatter-only matches
      // don't immediately starve full-body matches.
      const maxCandidates = max * 5;
      try {
        const ctx = resolveProjectContext();
        const resolved = resolveScope("notes", { scope, project, ctx });
        const candidatePaths = await collectCandidatePaths(nk, resolved.readPrefixes);
        const needle = query.toLowerCase();
        const hits: { path: string; title: string; snippet: string; tags: string[] }[] = [];
        let encryptedSkipped = 0;
        let scanned = 0;
        for (const filePath of candidatePaths) {
          // Encrypted note → decrypt (if unlocked) and match; otherwise note
          // it as skipped rather than failing the whole search (#49).
          if (isEncryptedItemPath(filePath)) {
            let note = null;
            try {
              const file = await nk.vault.readFile(filePath);
              note = file.content ? await decryptNote(filePath, file.content) : null;
            } catch {
              note = null; // locked or undecryptable
            }
            if (!note) {
              encryptedSkipped++;
              continue;
            }
            const hay = `${note.title}\n${note.tags.join(" ")}\n${note.body}`.toLowerCase();
            if (!hay.includes(needle)) continue;
            hits.push({
              path: filePath,
              title: note.title,
              tags: note.tags,
              snippet: makeSnippet(note.body, needle),
            });
            if (hits.length >= max) break;
            continue;
          }
          if (!filePath.endsWith(".md")) continue;
          if (scanned >= maxCandidates && hits.length === 0) break;
          scanned++;
          const file = await nk.vault.readFile(filePath);
          const { frontmatter, body } = parseMarkdown(file.content ?? "");
          const title = String(frontmatter["title"] ?? deriveTitle(filePath));
          const tags = normalizeTags(frontmatter["tags"]);
          const hay = `${title}\n${tags.join(" ")}\n${body}`.toLowerCase();
          if (!hay.includes(needle)) continue;
          hits.push({
            path: filePath,
            title,
            tags,
            snippet: makeSnippet(body, needle),
          });
          if (hits.length >= max) break;
        }
        return jsonContent({
          count: hits.length,
          scope: resolved.effective,
          project: resolved.project,
          results: hits,
          ...(encryptedSkippedNote(encryptedSkipped, "note") ?? {}),
        });
      } catch (err) {
        return errorContent(`notes_search failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "notes_read",
    {
      title: "Read note",
      description:
        "Read the full contents of a note by vault-relative path (e.g. `notes/meeting-2026-05-19.md` or `projects/notekit/notes/today.md`). Returns frontmatter and Markdown body. Use this after notes_search, or when the user names a specific note.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Vault-relative path, e.g. `projects/notekit/notes/today.md`."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ path }) => {
      try {
        const file = await nk.vault.readFile(path);
        // Encrypted note → decrypt with NOTEKIT_RECOVERY_PHRASE (#49).
        if (file.content && isEncryptedItemPath(path)) {
          const note = await decryptNote(path, file.content);
          if (!note) return errorContent(`notes_read: couldn't decrypt ${path}`);
          return jsonContent({
            path,
            sha: file.sha,
            frontmatter: {
              title: note.title,
              tags: note.tags,
              folder: note.folder,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
            },
            body: note.body,
          });
        }
        const parsed = parseMarkdown(file.content ?? "");
        return jsonContent({
          path: file.path,
          sha: file.sha,
          frontmatter: parsed.frontmatter,
          body: parsed.body,
        });
      } catch (err) {
        return errorContent(`notes_read failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "notes_create",
    {
      title: "Create note",
      description:
        "Create a new note in the active scope. Default path is `<writePrefix><slugified-title>.md`, where `writePrefix` follows the resolved scope (`projects/<slug>/notes/` for project scope, `notes/` otherwise). Commits to the user's Git remote. Fails if a note already exists at the chosen path.",
      inputSchema: {
        title: z.string().min(1).describe("Note title (also stored in frontmatter)."),
        body: z.string().describe("Markdown body (without frontmatter)."),
        path: z
          .string()
          .optional()
          .describe(
            "Optional absolute vault path. When omitted, defaults to `<writePrefix><slugified-title>.md` based on the resolved scope.",
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional tag list, stored in frontmatter."),
        commitMessage: z
          .string()
          .optional()
          .describe("Git commit message (default: `notekit: add <title>`)."),
        scope: scopeSchema,
        project: projectSchema,
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ title, body, path, tags, commitMessage, scope, project }) => {
      try {
        const now = new Date().toISOString();
        // Born-E2EE vault → seal the note as an opaque notes/<id>.md.age
        // (no slug/project in the path, which would leak the title). Agents
        // find it again via notes_search (which decrypts).
        if (await vaultIsEncrypted()) {
          const id = newItemId();
          const note: Note = {
            id,
            path: `notes/${id}.md.age`,
            title,
            body,
            frontmatter: {},
            createdAt: now,
            updatedAt: now,
            folder: null,
            tags: tags ?? [],
          };
          const sealed = await encryptNote(note);
          await nk.vault.writeFile(
            note.path,
            sealed,
            commitMessage ?? `notekit: add ${title}`,
          );
          return textContent(`Created encrypted note at ${note.path}`);
        }
        const ctx = resolveProjectContext();
        const resolved = resolveScope("notes", { scope, project, ctx });
        const targetPath = path ?? `${resolved.writePrefix}${slugify(title)}.md`;
        const frontmatter: Record<string, unknown> = {
          title,
          tags: tags ?? [],
          createdAt: now,
          updatedAt: now,
        };
        // Tag every note that lives outside top-level `notes/` with its
        // project slug so cross-project search-by-frontmatter still works
        // when the path-based scope misses it.
        if (resolved.project && targetPath.startsWith(`projects/${resolved.project}/`)) {
          frontmatter["project"] = resolved.project;
        }
        const content = serializeMarkdown({ frontmatter, body });
        await nk.vault.writeFile(
          targetPath,
          content,
          commitMessage ?? `notekit: add ${title}`,
        );
        return textContent(`Created note at ${targetPath}`);
      } catch (err) {
        return errorContent(`notes_create failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "notes_update",
    {
      title: "Update note",
      description:
        "Update an existing note. Merges the provided frontmatter into the existing frontmatter (use `null` to clear a field) and replaces the body if `body` is provided. Use when the user wants to edit, append to, or retag a note.",
      inputSchema: {
        path: z.string().min(1).describe("Vault-relative path of the note to update."),
        body: z.string().optional().describe("New full Markdown body (replaces existing body)."),
        frontmatterPatch: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Partial frontmatter to merge in. Pass `null` for a field to remove it."),
        commitMessage: z.string().optional().describe("Git commit message."),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ path, body, frontmatterPatch, commitMessage }) => {
      try {
        const existing = await nk.vault.readFile(path);
        // Encrypted note → decrypt, merge, re-encrypt (#49).
        if (existing.content && isEncryptedItemPath(path)) {
          const note = await decryptNote(path, existing.content);
          if (!note) return errorContent(`notes_update: couldn't decrypt ${path}`);
          if (body !== undefined) note.body = body;
          if (frontmatterPatch) {
            if ("title" in frontmatterPatch) {
              note.title = frontmatterPatch["title"] == null ? "" : String(frontmatterPatch["title"]);
            }
            if ("tags" in frontmatterPatch) {
              const t = frontmatterPatch["tags"];
              note.tags = Array.isArray(t) ? t.map(String) : [];
            }
            if ("folder" in frontmatterPatch) {
              const f = frontmatterPatch["folder"];
              note.folder = f == null ? null : String(f);
            }
          }
          note.updatedAt = new Date().toISOString();
          const sealed = await encryptNote(note);
          await nk.vault.writeFile(
            path,
            sealed,
            commitMessage ?? `notekit: update ${path}`,
            existing.sha ?? undefined,
          );
          return textContent(`Updated ${path}`);
        }
        const parsed = parseMarkdown(existing.content ?? "");
        const mergedFm: Record<string, unknown> = { ...parsed.frontmatter };
        if (frontmatterPatch) {
          for (const [k, v] of Object.entries(frontmatterPatch)) {
            if (v === null) delete mergedFm[k];
            else mergedFm[k] = v;
          }
        }
        mergedFm["updatedAt"] = new Date().toISOString();
        const nextContent = serializeMarkdown({
          frontmatter: mergedFm,
          body: body ?? parsed.body,
        });
        await nk.vault.writeFile(
          path,
          nextContent,
          commitMessage ?? `notekit: update ${path}`,
          existing.sha ?? undefined,
        );
        return textContent(`Updated ${path}`);
      } catch (err) {
        return errorContent(`notes_update failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "notes_delete",
    {
      title: "Delete note",
      description:
        "Delete a note. The deletion is committed to the user's Git remote — it stays in history, but won't appear in the UI. Use when the user explicitly asks to remove a note. Always prefer `notes_search` first to confirm you have the right file.",
      inputSchema: {
        path: z.string().min(1).describe("Vault-relative path of the note to delete."),
        commitMessage: z.string().optional().describe("Git commit message."),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ path, commitMessage }) => {
      try {
        const file = await nk.vault.readFile(path);
        if (!file.sha) {
          return errorContent(
            `notes_delete: ${path} has no SHA — refusing to delete to avoid surprises.`,
          );
        }
        await nk.vault.deleteFile(path, file.sha, commitMessage ?? `notekit: delete ${path}`);
        return textContent(`Deleted ${path}`);
      } catch (err) {
        return errorContent(`notes_delete failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "notes_move",
    {
      title: "Move / rename note",
      description:
        "Move or rename a note. Atomic-ish: the new path is written first (with the original content + an updated `updatedAt`), then the old path is deleted. Two commits. Use when the user wants to rename, reorganize, or migrate a note between project folders.",
      inputSchema: {
        from: z.string().min(1).describe("Existing vault path."),
        to: z.string().min(1).describe("New vault path."),
        commitMessage: z.string().optional().describe("Git commit message (used for both commits)."),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ from, to, commitMessage }) => {
      try {
        if (from === to) {
          return errorContent(`notes_move: 'from' and 'to' are identical (${from}).`);
        }
        if (isEncryptedItemPath(from) || isEncryptedItemPath(to)) {
          return errorContent(
            `notes_move: end-to-end encrypted notes can't be moved server-side — the user must rename on a device.`,
          );
        }
        const existing = await nk.vault.readFile(from);
        if (!existing.sha) {
          return errorContent(`notes_move: source ${from} has no SHA — refusing to move.`);
        }
        const parsed = parseMarkdown(existing.content ?? "");
        const nextFm: Record<string, unknown> = {
          ...parsed.frontmatter,
          updatedAt: new Date().toISOString(),
        };
        const nextContent = serializeMarkdown({ frontmatter: nextFm, body: parsed.body });
        const msg = commitMessage ?? `notekit: move ${from} → ${to}`;
        await nk.vault.writeFile(to, nextContent, msg);
        await nk.vault.deleteFile(from, existing.sha, msg);
        return textContent(`Moved ${from} → ${to}`);
      } catch (err) {
        return errorContent(`notes_move failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "notes_append",
    {
      title: "Append to note",
      description:
        "Append a chunk of Markdown to the end of an existing note's body without re-reading the whole file in conversation. A blank line is inserted between the existing body and the new content unless the existing body is empty.",
      inputSchema: {
        path: z.string().min(1).describe("Vault-relative path of the note."),
        content: z.string().min(1).describe("Markdown to append."),
        commitMessage: z.string().optional().describe("Git commit message."),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ path, content, commitMessage }) => {
      try {
        if (isEncryptedItemPath(path)) {
          return errorContent(
            `notes_append: ${path} is end-to-end encrypted — open on a device to edit.`,
          );
        }
        const existing = await nk.vault.readFile(path);
        const parsed = parseMarkdown(existing.content ?? "");
        const separator = parsed.body.trim() ? "\n\n" : "";
        const nextBody = `${parsed.body.replace(/\s+$/, "")}${separator}${content}`;
        const nextFm: Record<string, unknown> = {
          ...parsed.frontmatter,
          updatedAt: new Date().toISOString(),
        };
        const nextContent = serializeMarkdown({ frontmatter: nextFm, body: nextBody });
        await nk.vault.writeFile(
          path,
          nextContent,
          commitMessage ?? `notekit: append to ${path}`,
          existing.sha ?? undefined,
        );
        return textContent(`Appended to ${path}`);
      } catch (err) {
        return errorContent(`notes_append failed: ${(err as Error).message}`);
      }
    },
  );
}

/**
 * List files under every scope prefix, dedup by path, and apply a stable
 * order: project-scoped first, then global. The order matches the
 * read-everywhere semantics — duplicates won't happen in practice (a path
 * can only live under one prefix at a time) but we dedup to be safe.
 */
async function collectCandidatePaths(
  nk: NoteKitApi,
  prefixes: string[],
): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const prefix of prefixes) {
    const entries = await listVaultFiles(nk, prefix);
    for (const entry of entries) {
      if (!isUnderAnyPrefix(entry.path, [prefix])) continue;
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      out.push(entry.path);
    }
  }
  return out;
}

function deriveTitle(filePath: string): string {
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.md$/, "");
}

/**
 * Frontmatter `tags` is `unknown` at the type level. Normalize anything
 * sensible into `string[]` so the search haystack is plain text and the
 * response shape is predictable for the calling LLM.
 */
function normalizeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t));
  if (typeof raw === "string") return raw.split(/[,\s]+/).filter(Boolean);
  return [];
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function makeSnippet(body: string, needle: string, radius = 80): string {
  const idx = body.toLowerCase().indexOf(needle);
  if (idx === -1) return body.slice(0, 160);
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + needle.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return `${prefix}${body.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}
