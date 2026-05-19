// Notes tools — search, read, create, update notes in the currently selected
// vault. Notes are stored as `notes/<slug>.md` with YAML frontmatter.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { errorContent, jsonContent, listVaultFiles, textContent } from "../lib/notekit.js";
import { parseMarkdown, serializeMarkdown } from "../lib/markdown.js";

const NOTES_PREFIX = "notes/";

export function registerNoteTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "notes_search",
    {
      title: "Search notes",
      description:
        "Search notes in the user's selected NoteKit vault. Returns matching notes with path, title, and a short snippet. Use this BEFORE notes_read when the user describes content rather than naming a specific file. Matching is case-insensitive substring against title, tags, and body.",
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
      },
    },
    async ({ query, limit }) => {
      const max = limit ?? 10;
      try {
        const entries = await listVaultFiles(nk, NOTES_PREFIX);
        const needle = query.toLowerCase();
        const hits: { path: string; title: string; snippet: string; tags: unknown }[] = [];

        for (const entry of entries) {
          if (!entry.path.endsWith(".md")) continue;
          const file = await nk.vault.readFile(entry.path);
          const { frontmatter, body } = parseMarkdown(file.content ?? "");
          const title = String(frontmatter["title"] ?? deriveTitle(entry.path));
          const tags = frontmatter["tags"] ?? [];
          const hay = `${title}\n${JSON.stringify(tags)}\n${body}`.toLowerCase();
          if (!hay.includes(needle)) continue;
          hits.push({
            path: entry.path,
            title,
            tags,
            snippet: makeSnippet(body, needle),
          });
          if (hits.length >= max) break;
        }

        return jsonContent({ count: hits.length, results: hits });
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
        "Read the full contents of a note by path (e.g. `notes/meeting-2026-05-19.md`). Returns frontmatter and Markdown body. Use this after notes_search, or when the user names a specific note.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .describe("Vault-relative path, e.g. `notes/today.md`."),
      },
    },
    async ({ path }) => {
      try {
        const file = await nk.vault.readFile(path);
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
        "Create a new note in the selected vault. Commits to the user's Git remote with the given commit message. Use when the user wants to capture a new idea, meeting note, or journal entry. Fails if a note already exists at the chosen path.",
      inputSchema: {
        title: z.string().min(1).describe("Note title (also used in frontmatter)."),
        body: z.string().describe("Markdown body (without frontmatter)."),
        path: z
          .string()
          .optional()
          .describe(
            "Optional vault-relative path. Defaults to `notes/<slugified-title>.md`.",
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe("Optional tag list, stored in frontmatter."),
        commitMessage: z
          .string()
          .optional()
          .describe("Git commit message (default: `notekit: add <title>`)."),
      },
    },
    async ({ title, body, path, tags, commitMessage }) => {
      try {
        const targetPath = path ?? `${NOTES_PREFIX}${slugify(title)}.md`;
        const now = new Date().toISOString();
        const content = serializeMarkdown({
          frontmatter: {
            title,
            tags: tags ?? [],
            createdAt: now,
            updatedAt: now,
          },
          body,
        });
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
    },
    async ({ path, body, frontmatterPatch, commitMessage }) => {
      try {
        const existing = await nk.vault.readFile(path);
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
}

function deriveTitle(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/, "");
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
