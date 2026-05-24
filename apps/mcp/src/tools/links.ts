// Links tools — list and save URLs in the user's vault.
//
// Links are stored at `<writePrefix><folder?>/<slug>.md` with the exact shape
// the NoteKit web app's `serializeLink` produces, so the link the agent saves
// shows up in the LinksView immediately:
//
//   ---
//   id: lnk-<short>
//   url: https://example.com
//   platform: <detected>
//   folder: research/papers     # optional, mirrors note folders
//   tags: [a, b]
//   createdAt: <iso>
//   updatedAt: <iso>
//   ---
//   # <title>
//
//   <description>
//
// We keep encryption out of scope here — the MCP server can't see ciphertext,
// so anything we'd save is plaintext by design.

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
import { parseMarkdown } from "../lib/markdown.js";
import { resolveProjectContext } from "../lib/project.js";
import { isUnderAnyPrefix, resolveScope } from "../lib/scope.js";

const SCOPE_VALUES = ["project", "global", "all"] as const;

export function registerLinkTools(server: McpServer, nk: NoteKitApi): void {
  server.registerTool(
    "links_list",
    {
      title: "List saved links",
      description:
        "List saved links in the active scope. Each result includes id, url, title, description, tags, and the vault path. Use when the user asks 'what did I save', 'show my reading list', or before `links_create` to avoid dupes.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50)."),
        tag: z.string().optional().describe("Filter by an exact tag."),
        folder: z
          .string()
          .optional()
          .describe(
            "Filter by folder. Exact match (e.g. \"research/papers\") or prefix with trailing /* (e.g. \"research/*\") to include subfolders. Use \"\" or \"/\" to match the vault root only.",
          ),
        scope: z.enum(SCOPE_VALUES).optional(),
        project: z.string().optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ limit, tag, folder, scope, project }) => {
      try {
        const max = limit ?? 50;
        const ctx = resolveProjectContext();
        const resolved = resolveScope("links", { scope, project, ctx });
        const seen = new Set<string>();
        const links: Record<string, unknown>[] = [];
        let encryptedSkipped = 0;
        for (const prefix of resolved.readPrefixes) {
          const entries = await listVaultFiles(nk, prefix);
          for (const entry of entries) {
            if (!isUnderAnyPrefix(entry.path, [prefix])) continue;
            if (seen.has(entry.path)) continue;
            seen.add(entry.path);
            if (isEncryptedItemPath(entry.path)) {
              encryptedSkipped++;
              continue;
            }
            if (!entry.path.endsWith(".md")) continue;
            const file = await nk.vault.readFile(entry.path);
            const parsed = parseMarkdown(file.content ?? "");
            const fm = parsed.frontmatter;
            if (typeof fm["url"] !== "string") continue;
            const tags = Array.isArray(fm["tags"]) ? (fm["tags"] as unknown[]).map((t) => String(t)) : [];
            if (tag && !tags.includes(tag)) continue;
            const entryFolder = resolveLinkFolder(fm["folder"], entry.path, prefix);
            if (folder !== undefined && !matchesFolderFilter(entryFolder, folder)) {
              continue;
            }
            links.push({
              path: entry.path,
              id: String(fm["id"] ?? ""),
              url: fm["url"],
              title: extractTitle(parsed.body),
              description: extractDescription(parsed.body),
              platform: fm["platform"] ?? null,
              folder: entryFolder,
              tags,
              createdAt: fm["createdAt"] ?? null,
              updatedAt: fm["updatedAt"] ?? null,
            });
            if (links.length >= max) break;
          }
          if (links.length >= max) break;
        }
        return jsonContent({
          count: links.length,
          scope: resolved.effective,
          project: resolved.project,
          links,
          ...(encryptedSkippedNote(encryptedSkipped, "link") ?? {}),
        });
      } catch (err) {
        return errorContent(`links_list failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "links_create",
    {
      title: "Save link",
      description:
        "Save a URL to the active scope. Stores a Markdown file with frontmatter (`id`, `url`, `platform`, `tags`, timestamps) and `# <title>` body, matching the format the NoteKit web app reads. Use when the user shares a URL they want to remember.",
      inputSchema: {
        url: z.string().url().describe("The URL to save."),
        title: z.string().optional().describe("Optional title; defaults to URL hostname."),
        description: z.string().optional().describe("Optional description / notes."),
        tags: z.array(z.string()).optional().describe("Optional tags."),
        folder: z
          .string()
          .optional()
          .describe(
            "Folder to save under, vault-relative (e.g. \"research/papers\"). Slashes nest. Leave unset for the vault root.",
          ),
        scope: z.enum(SCOPE_VALUES).optional(),
        project: z.string().optional(),
        commitMessage: z.string().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ url, title, description, tags, folder, scope, project, commitMessage }) => {
      try {
        const ctx = resolveProjectContext();
        const resolved = resolveScope("links", { scope, project, ctx });
        const now = new Date().toISOString();
        const displayTitle = (title ?? titleFromUrl(url)).trim() || titleFromUrl(url);
        const platform = detectPlatform(url);
        const id = generateLinkId();
        const slug = `${slugify(displayTitle)}--${shortFromId(id)}`;
        const cleanedFolder = sanitizeFolder(folder);
        const folderSegment = cleanedFolder ? `${cleanedFolder}/` : "";
        const targetPath = `${resolved.writePrefix}${folderSegment}${slug}.md`;
        const fm: Record<string, unknown> = {
          id,
          url,
          platform,
          // Mirror serializeLink: only emit `folder` when it's set, so root
          // links don't carry a `folder: null` line.
          ...(cleanedFolder ? { folder: cleanedFolder } : {}),
          tags: tags ?? [],
          createdAt: now,
          updatedAt: now,
        };
        if (resolved.project && targetPath.startsWith(`projects/${resolved.project}/`)) {
          fm["project"] = resolved.project;
        }
        const body = description ? `# ${displayTitle}\n\n${description}` : `# ${displayTitle}`;
        const content = serializeLinkMarkdown(fm, body);
        await nk.vault.writeFile(
          targetPath,
          content,
          commitMessage ?? `notekit: save ${displayTitle}`,
        );
        return textContent(`Saved ${url} → ${targetPath}`);
      } catch (err) {
        return errorContent(`links_create failed: ${(err as Error).message}`);
      }
    },
  );
}

function extractTitle(body: string): string {
  const first = body.split("\n", 1)[0]?.trim() ?? "";
  if (first.startsWith("# ")) return first.slice(2).trim() || "Untitled";
  return "Untitled";
}

function extractDescription(body: string): string | null {
  const lines = body.split("\n");
  const rest = lines.slice(1).join("\n").replace(/^\n+/, "").trim();
  return rest || null;
}

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
}

// Mirror packages/core/src/lib/link-platform.ts minimally: just the
// well-known hosts so saved links land in the right "platform" bucket
// in the web UI. Unknown hosts → null (matches existing UI behavior).
function detectPlatform(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host.endsWith("youtube.com") || host === "youtu.be") return "youtube";
  if (host === "twitter.com" || host === "x.com") return "twitter";
  if (host === "github.com") return "github";
  if (host === "linkedin.com") return "linkedin";
  if (host === "medium.com") return "medium";
  if (host === "tiktok.com") return "tiktok";
  return null;
}

function slugify(text: string): string {
  const ascii = text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "link";
}

function generateLinkId(): string {
  // Mirror nanoid-style: 8 url-safe chars. We use crypto.randomUUID() and
  // strip dashes so we don't add a dep.
  const u = (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`).replace(/-/g, "");
  return `lnk-${u.slice(0, 8)}`;
}

function shortFromId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, "").slice(-6) || "x";
}

const FOLDER_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FOLDER_MAX_LEN = 120;

/**
 * Mirror packages/core/src/lib/file-paths.ts#sanitizeFolderPath. Slugify
 * each segment too — agents may pass human strings like "Research / Papers"
 * and we want the on-disk path to be url/git-friendly. Returns null for
 * the vault root (undefined input, empty string, or anything unsafe).
 */
function sanitizeFolder(raw: string | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  if (raw.length > FOLDER_MAX_LEN) return null;
  if (/[ -]/.test(raw)) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return null;
  if (trimmed.startsWith("/")) return null;
  const segments = trimmed
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  const cleaned: string[] = [];
  for (const seg of segments) {
    if (seg === "." || seg === "..") return null;
    const slug = slugify(seg);
    if (!slug || !FOLDER_SEGMENT_RE.test(slug)) return null;
    cleaned.push(slug);
  }
  return cleaned.join("/");
}

/**
 * Resolve a link's folder for the list response. Prefer explicit
 * `folder:` frontmatter; fall back to deriving it from the on-disk path
 * relative to the read prefix so links written under nested folders by
 * hand (or by older clients) still report the right folder.
 */
function resolveLinkFolder(
  raw: unknown,
  path: string,
  prefix: string,
): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const rel = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  const slash = rel.lastIndexOf("/");
  if (slash === -1) return null;
  return rel.slice(0, slash);
}

/**
 * Match the link's folder against the filter. Supports:
 *   ""          — vault root only
 *   "/"         — vault root only
 *   "research"  — exact match
 *   "research/*" — research and any subfolder under it
 */
function matchesFolderFilter(linkFolder: string | null, filter: string): boolean {
  const f = filter.trim();
  if (f === "" || f === "/") return linkFolder === null;
  if (f.endsWith("/*")) {
    const prefix = f.slice(0, -2);
    if (!linkFolder) return false;
    return linkFolder === prefix || linkFolder.startsWith(`${prefix}/`);
  }
  return linkFolder === f;
}

/**
 * Match `packages/core/src/lib/serialize.ts#serializeLink` output: tags
 * are emitted as a block (`-` items) rather than `[a, b]`, platform may
 * be null and is then skipped. Tiny YAML — keeps the deserializer in
 * the web app happy.
 */
function serializeLinkMarkdown(fm: Record<string, unknown>, body: string): string {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) lines.push(`${k}: []`);
      else {
        lines.push(`${k}:`);
        for (const item of v) lines.push(`  - ${yamlString(String(item))}`);
      }
    } else {
      lines.push(`${k}: ${yamlString(String(v))}`);
    }
  }
  lines.push("---");
  return `${lines.join("\n")}\n${body}\n`;
}

function yamlString(v: string): string {
  if (v === "") return '""';
  if (/^[A-Za-z0-9 _\-.,/:]+$/.test(v)) return v;
  return JSON.stringify(v);
}
