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
// E2EE vaults: links are stored as `links/<id>.md.age` (sealed with age).
// The server reads NOTEKIT_RECOVERY_PHRASE to decrypt/re-encrypt on the fly.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NoteKitApi } from "@notekit/api-client";
import { slugify } from "@notekit/core/paths";
import type { SavedLink } from "@notekit/core/types";
import { z } from "zod";
import { vaultIsEncrypted, encryptLink, decryptLink } from "../lib/crypto.js";
import { parseMarkdown } from "../lib/markdown.js";
import {
  encryptedSkippedNote,
  errorContent,
  isEncryptedItemPath,
  jsonContent,
  listVaultFiles,
  textContent,
} from "../lib/notekit.js";
import { resolveProjectContext } from "../lib/project.js";
import { isUnderAnyPrefix, resolveScope } from "../lib/scope.js";

const SCOPE_VALUES = ["project", "global", "all"] as const;

// eslint-disable-next-line max-lines-per-function -- registration function that wires up four tools with their full schemas and handlers
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
          const result = await collectLinksFromPrefix(nk, prefix, { tag, folder, max, seen });
          encryptedSkipped += result.encryptedSkipped;
          links.push(...result.links);
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
        const now = new Date().toISOString();
        const displayTitle = (title ?? titleFromUrl(url)).trim() || titleFromUrl(url);
        const platform = detectPlatform(url);
        const id = generateLinkId();
        const cleanedFolder = sanitizeFolder(folder);

        // Born-E2EE vault → seal the link as `links/<id>.md.age` (no slug/folder
        // in the path; folder lives inside the ciphertext as private metadata).
        if (await vaultIsEncrypted()) {
          const linkObj: SavedLink = {
            id,
            path: `links/${id}.md.age`,
            url,
            title: displayTitle,
            description: description ?? null,
            platform,
            tags: tags ?? [],
            folder: cleanedFolder,
            createdAt: now,
            updatedAt: now,
          };
          const sealed = await encryptLink(linkObj);
          await nk.vault.writeFile(
            linkObj.path,
            sealed,
            commitMessage ?? `notekit: save ${displayTitle}`,
          );
          return textContent(`Saved ${url} → ${linkObj.path}`);
        }

        const ctx = resolveProjectContext();
        const resolved = resolveScope("links", { scope, project, ctx });
        const slug = `${slugify(displayTitle)}--${shortFromId(id)}`;
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

  server.registerTool(
    "links_update",
    {
      title: "Update saved link",
      description:
        "Update a saved link's url, title, description, or tags. Reads the existing file, merges the provided fields, and writes back using the same Markdown/frontmatter format. The vault path is unchanged. Use when the user wants to retag, retitle, or correct a saved link.",
      inputSchema: {
        path: z.string().min(1).describe("Vault-relative path of the link to update."),
        url: z.string().url().optional().describe("New URL (replaces existing)."),
        title: z.string().optional().describe("New title (replaces the `# heading` in the body)."),
        description: z
          .string()
          .nullable()
          .optional()
          .describe("New description. Pass `null` to remove it."),
        tags: z.array(z.string()).optional().describe("New tag list (replaces existing tags)."),
        folder: z
          .string()
          .nullable()
          .optional()
          .describe("Move the link to a different folder (updates frontmatter only, path stays the same). Pass `null` to clear."),
        commitMessage: z.string().optional().describe("Git commit message."),
      },
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async ({ path, url, title, description, tags, folder, commitMessage }) => {
      try {
        const existing = await nk.vault.readFile(path);

        // Encrypted link → decrypt, merge fields, re-encrypt (#49).
        if (isEncryptedItemPath(path)) {
          if (!existing.content) {
            return errorContent(`links_update: ${path} is empty`);
          }
          const link = await decryptLink(path, existing.content);
          if (!link) return errorContent(`links_update: couldn't decrypt ${path}`);
          applyEncryptedLinkPatch(link, { url, title, description, tags, folder });
          link.updatedAt = new Date().toISOString();
          const sealed = await encryptLink(link);
          await nk.vault.writeFile(
            path,
            sealed,
            commitMessage ?? `notekit: update link ${path}`,
            existing.sha ?? undefined,
          );
          return textContent(`Updated ${path}`);
        }

        const parsed = parseMarkdown(existing.content ?? "");
        const fm: Record<string, unknown> = { ...parsed.frontmatter };
        applyPlaintextLinkFm(fm, { url, tags, folder });
        fm["updatedAt"] = new Date().toISOString();

        const existingTitle = extractTitle(parsed.body);
        const displayTitle = (title ?? existingTitle).trim() || existingTitle;
        const body = buildUpdatedLinkBody(parsed.body, { title: displayTitle, description });

        const content = serializeLinkMarkdown(fm, body);
        await nk.vault.writeFile(
          path,
          content,
          commitMessage ?? `notekit: update link ${path}`,
          existing.sha ?? undefined,
        );
        return textContent(`Updated ${path}`);
      } catch (err) {
        return errorContent(`links_update failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "links_delete",
    {
      title: "Delete saved link",
      description:
        "Delete a saved link. The deletion is committed to Git — it stays in history but won't appear in the UI. Use when the user explicitly asks to remove a saved link. Always prefer `links_list` first to confirm you have the right file.",
      inputSchema: {
        path: z.string().min(1).describe("Vault-relative path of the link to delete."),
        commitMessage: z.string().optional().describe("Git commit message."),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ path, commitMessage }) => {
      try {
        const file = await nk.vault.readFile(path);
        if (!file.sha) {
          return errorContent(
            `links_delete: ${path} has no SHA — refusing to delete to avoid surprises.`,
          );
        }
        await nk.vault.deleteFile(path, file.sha, commitMessage ?? `notekit: delete link ${path}`);
        return textContent(`Deleted ${path}`);
      } catch (err) {
        return errorContent(`links_delete failed: ${(err as Error).message}`);
      }
    },
  );
}

interface CollectLinksOptions {
  tag: string | undefined;
  folder: string | undefined;
  max: number;
  seen: Set<string>;
}

interface CollectLinksResult {
  links: Record<string, unknown>[];
  encryptedSkipped: number;
}

/**
 * Walk one read-prefix and collect matching link records up to `max`. Tracks
 * already-seen paths via `seen` so duplicate entries across prefixes are
 * deduplicated. Returns the collected links and a count of encrypted entries
 * that were skipped because the vault was locked.
 */
async function collectLinksFromPrefix(
  nk: NoteKitApi,
  prefix: string,
  { tag, folder, max, seen }: CollectLinksOptions,
): Promise<CollectLinksResult> {
  const links: Record<string, unknown>[] = [];
  let encryptedSkipped = 0;
  const entries = await listVaultFiles(nk, prefix);
  for (const entry of entries) {
    if (!isUnderAnyPrefix(entry.path, [prefix])) continue;
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    const result = await processLinkEntry(nk, entry.path, prefix, { tag, folder });
    if (result === "encrypted-failed") { encryptedSkipped++; continue; }
    if (!result) continue;
    links.push(result);
    if (links.length >= max) break;
  }
  return { links, encryptedSkipped };
}

/**
 * Process a single vault entry for the links list handler. Dispatches to the
 * encrypted or plaintext path and returns the link record, null if filtered
 * out, or 'encrypted-failed' if the vault is locked.
 */
async function processLinkEntry(
  nk: NoteKitApi,
  path: string,
  prefix: string,
  filters: { tag: string | undefined; folder: string | undefined },
): Promise<Record<string, unknown> | null | "encrypted-failed"> {
  if (isEncryptedItemPath(path)) {
    const result = await readEncryptedLinkEntry(nk, path, filters.tag, filters.folder);
    if (!result) return "encrypted-failed";
    return result;
  }
  if (!path.endsWith(".md")) return null;
  return readPlaintextLinkEntry(nk, path, prefix, filters.tag, filters.folder);
}

/**
 * Read and decrypt a single encrypted link entry for the list handler.
 * Returns the link record if decryption succeeded and filters pass, or
 * null if the vault is locked or the entry does not match the filters.
 */
async function readEncryptedLinkEntry(
  nk: NoteKitApi,
  path: string,
  tag: string | undefined,
  folder: string | undefined,
): Promise<Record<string, unknown> | null> {
  let link: SavedLink | null = null;
  try {
    const file = await nk.vault.readFile(path);
    link = file.content ? await decryptLink(path, file.content) : null;
  } catch {
    link = null;
  }
  if (!link) return null;
  if (tag && !link.tags.includes(tag)) return null;
  const entryFolder = link.folder ?? null;
  if (folder !== undefined && !matchesFolderFilter(entryFolder, folder)) return null;
  return {
    path,
    id: link.id,
    url: link.url,
    title: link.title,
    description: link.description,
    platform: link.platform,
    folder: entryFolder,
    tags: link.tags,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

/**
 * Read and parse a single plaintext `.md` link file for the list handler.
 * Returns the link record if it passes the tag/folder filters, or null if the
 * file is not a valid link or does not match.
 */
async function readPlaintextLinkEntry(
  nk: NoteKitApi,
  path: string,
  prefix: string,
  tag: string | undefined,
  folder: string | undefined,
): Promise<Record<string, unknown> | null> {
  const file = await nk.vault.readFile(path);
  const parsed = parseMarkdown(file.content ?? "");
  const fm = parsed.frontmatter;
  if (typeof fm["url"] !== "string") return null;
  const tags = Array.isArray(fm["tags"]) ? (fm["tags"] as unknown[]).map((t) => String(t)) : [];
  if (tag && !tags.includes(tag)) return null;
  const entryFolder = resolveLinkFolder(fm["folder"], path, prefix);
  if (folder !== undefined && !matchesFolderFilter(entryFolder, folder)) return null;
  return {
    path,
    id: String(fm["id"] ?? ""),
    url: fm["url"],
    title: extractTitle(parsed.body),
    description: extractDescription(parsed.body),
    platform: fm["platform"] ?? null,
    folder: entryFolder,
    tags,
    createdAt: fm["createdAt"] ?? null,
    updatedAt: fm["updatedAt"] ?? null,
  };
}

interface LinkPatch {
  url?: string;
  title?: string;
  description?: string | null;
  tags?: string[];
  folder?: string | null;
}

/**
 * Mutate an encrypted SavedLink in-place with the fields from a links_update call.
 * Does NOT set updatedAt — the caller sets that after.
 */
function applyEncryptedLinkPatch(link: SavedLink, patch: LinkPatch): void {
  if (patch.url !== undefined) {
    link.url = patch.url;
    link.platform = detectPlatform(patch.url);
  }
  if (patch.title !== undefined) link.title = patch.title;
  if (patch.description !== undefined) link.description = patch.description;
  if (patch.tags !== undefined) link.tags = patch.tags;
  if (patch.folder !== undefined) {
    link.folder = patch.folder === null ? null : sanitizeFolder(patch.folder);
  }
}

/**
 * Mutate a plaintext frontmatter object in-place for a links_update call.
 */
function applyPlaintextLinkFm(
  fm: Record<string, unknown>,
  patch: { url?: string; tags?: string[]; folder?: string | null },
): void {
  if (patch.url !== undefined) {
    fm["url"] = patch.url;
    fm["platform"] = detectPlatform(patch.url);
  }
  if (patch.tags !== undefined) fm["tags"] = patch.tags;
  if (patch.folder !== undefined) {
    if (patch.folder === null) {
      delete fm["folder"];
    } else {
      const cleaned = sanitizeFolder(patch.folder);
      if (cleaned) fm["folder"] = cleaned;
    }
  }
}

/**
 * Build the updated Markdown body for a plaintext links_update call.
 * Handles three cases: remove description (null), set new description, or
 * keep existing description while updating the heading.
 */
function buildUpdatedLinkBody(
  existingBody: string,
  { title, description }: { title: string; description?: string | null },
): string {
  if (description === null) {
    return `# ${title}`;
  }
  if (description !== undefined) {
    return `# ${title}\n\n${description}`;
  }
  const existingDesc = extractDescription(existingBody);
  return existingDesc ? `# ${title}\n\n${existingDesc}` : `# ${title}`;
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
function sanitizeFolder(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  if (raw.length > FOLDER_MAX_LEN) return null;
  // eslint-disable-next-line no-control-regex -- intentional control-char matching to reject folder paths with control characters
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
