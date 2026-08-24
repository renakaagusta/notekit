// `notekit link <sub>` — CRUD over saved links in the active vault.
// Links are Markdown files under `links/` with YAML frontmatter, matching the
// exact schema the NoteKit web app and MCP server use (see apps/mcp/src/tools/links.ts).
//
// Plaintext schema (links/<slug>--<shortId>.md):
//   ---
//   id: lnk-<8chars>
//   url: https://example.com
//   platform: github|youtube|... (or omitted)
//   folder: research/papers       (optional)
//   tags: []
//   createdAt: <iso>
//   updatedAt: <iso>
//   ---
//   # <title>
//
//   <description>
//
// Encrypted vault: files stored as links/<id>.md.age.

import type { NoteKitApi } from "@notekit/api-client";
import {
  serializeEncryptedLink,
  deserializeEncryptedLink,
} from "@notekit/core/crypto";
import { slugify } from "@notekit/core/paths";
import type { SavedLink } from "@notekit/core/types";
import { recipientsFor } from "@notekit/core/vault-e2ee";
import { defineCommand } from "citty";
import kleur from "kleur";
import {
  dieWithError,
  isEncrypted,
  vaultIsEncrypted,
  requireVaultIdentity,
  getSecretsClient,
} from "../../../composition/index.js";

const LINKS_DIR = "links";

// ── helpers ────────────────────────────────────────────────────────────────

/** Detect well-known platforms from URL, matching the MCP tool's logic. */
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

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
}


function generateLinkId(): string {
  const u = (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`
  ).replace(/-/g, "");
  return `lnk-${u.slice(0, 8)}`;
}

function shortFromId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, "").slice(-6) || "x";
}

/** Quote a scalar value for our flat YAML subset. */
function yamlString(v: string): string {
  if (v === "") return '""';
  if (/^[A-Za-z0-9 _\-.,/:]+$/.test(v)) return v;
  return JSON.stringify(v);
}

/** Serialize one YAML field into one or more lines. */
function yamlLines(k: string, v: unknown): string[] {
  if (Array.isArray(v)) {
    if (v.length === 0) return [`${k}: []`];
    return [`${k}:`, ...v.map((item) => `  - ${yamlString(String(item))}`)];
  }
  return [`${k}: ${yamlString(String(v))}`];
}

/**
 * Serialize a SavedLink to Markdown with YAML frontmatter.
 * Mirrors `serializeLinkMarkdown` in apps/mcp/src/tools/links.ts and
 * `serializeLink` in packages/core/src/lib/serialize.ts.
 */
function serializeLinkMarkdown(link: Omit<SavedLink, "path" | "encrypted">): string {
  const fm: Record<string, unknown> = {
    id: link.id,
    url: link.url,
    ...(link.platform ? { platform: link.platform } : {}),
    ...(link.folder ? { folder: link.folder } : {}),
    tags: link.tags,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };

  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (v === null || v === undefined) continue;
    lines.push(...yamlLines(k, v));
  }
  lines.push("---");

  const body = link.description
    ? `# ${link.title}\n\n${link.description}`
    : `# ${link.title}`;

  return `${lines.join("\n")}\n${body}\n`;
}

/** Apply a single YAML frontmatter line to the accumulator. */
function applyYamlLine(
  line: string,
  fm: Record<string, unknown>,
  state: { inList: boolean; listKey: string },
): void {
  const listItem = line.match(/^ {2}- (.*)$/);
  if (listItem && state.inList) {
    const itemVal = listItem[1] ?? "";
    (fm[state.listKey] as string[]).push(itemVal.trim().replace(/^"|"$/g, ""));
    return;
  }
  state.inList = false;
  const kv = line.match(/^([^:]+):\s*(.*)?$/);
  if (!kv) return;
  const key = (kv[1] ?? "").trim();
  const val = (kv[2] ?? "").trim();
  if (val === "") {
    fm[key] = [];
    state.inList = true;
    state.listKey = key;
  } else if (val === "[]") {
    fm[key] = [];
  } else {
    fm[key] = val.replace(/^"|"$/g, "");
  }
}

/** Minimal YAML parser for the flat key:value structure we write. */
function parseFrontmatter(fmText: string): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  const state = { inList: false, listKey: "" };
  for (const line of fmText.split("\n")) {
    applyYamlLine(line, fm, state);
  }
  return fm;
}

/** Extract title and description from the Markdown body after frontmatter. */
function parseBody(bodyText: string): { title: string; description: string | null } {
  const bodyLines = bodyText.trim().split("\n");
  const titleLine = bodyLines[0] ?? "";
  const title = titleLine.startsWith("# ") ? titleLine.slice(2).trim() : "Untitled";
  const description = bodyLines.slice(1).join("\n").replace(/^\n+/, "").trim() || null;
  return { title, description };
}

/** Parse a plaintext link file into a partial SavedLink. */
function parseLinkMarkdown(path: string, content: string): Omit<SavedLink, "encrypted"> | null {
  // Split frontmatter from body.
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const fmText: string = match[1] ?? "";
  const bodyText: string = match[2] ?? "";

  const fm = parseFrontmatter(fmText);
  if (typeof fm["url"] !== "string") return null;

  const { title, description } = parseBody(bodyText);

  return {
    id: String(fm["id"] ?? ""),
    path,
    url: String(fm["url"]),
    title,
    description,
    platform: typeof fm["platform"] === "string" ? fm["platform"] : null,
    folder: typeof fm["folder"] === "string" ? fm["folder"] : null,
    tags: Array.isArray(fm["tags"]) ? (fm["tags"] as string[]) : [],
    createdAt: String(fm["createdAt"] ?? ""),
    updatedAt: String(fm["updatedAt"] ?? ""),
  };
}

/** Resolve an id/path to a vault path for a link file. */
async function resolveLinkPath(nk: NoteKitApi, idOrPath: string): Promise<string> {
  if (idOrPath.includes("/")) return idOrPath;
  if (idOrPath.endsWith(".md") || idOrPath.endsWith(".md.age")) {
    return idOrPath;
  }
  // E2EE vault: links/<id>.md.age
  if (await vaultIsEncrypted()) return `${LINKS_DIR}/${idOrPath}.md.age`;
  // Plaintext: scan directory for a file whose frontmatter id matches.
  try {
    const { entries } = await nk.vault.listFiles(`${LINKS_DIR}/`);
    for (const e of entries) {
      if (!e.path.endsWith(".md") || isEncrypted(e.path)) continue;
      const file = await nk.vault.readFile(e.path);
      const link = parseLinkMarkdown(e.path, file.content ?? "");
      if (link?.id === idOrPath) return e.path;
    }
  } catch {
    // fall through to basename guess
  }
  return `${LINKS_DIR}/${idOrPath}.md`;
}

// ── subcommands ────────────────────────────────────────────────────────────

interface LinkRow {
  id: string;
  title: string;
  url: string;
  tags: string[];
}

/** Validate and parse the --limit flag; returns a capped entry count. */
function parseLimit(rawLimit: string | undefined, fallback: number): number {
  if (!rawLimit) return fallback;
  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--limit must be a non-negative integer, got: ${rawLimit}`);
  }
  return parsed;
}

async function collectEncryptedLinks(
  nk: NoteKitApi,
  entries: { path: string }[],
  limit: number,
  filterTag: string | null,
): Promise<LinkRow[]> {
  const identity = await requireVaultIdentity();
  const results: LinkRow[] = [];
  for (const e of entries) {
    if (results.length >= limit) break;
    if (!e.path.endsWith(".md.age") || !e.path.startsWith(`${LINKS_DIR}/`)) continue;
    const file = await nk.vault.readFile(e.path);
    if (!file.content) continue;
    const link = await deserializeEncryptedLink(e.path, file.content, identity.identity);
    if (!link) continue;
    if (filterTag && !link.tags.includes(filterTag)) continue;
    results.push({ id: link.id, title: link.title, url: link.url, tags: link.tags });
  }
  return results;
}

async function collectPlaintextLinks(
  nk: NoteKitApi,
  entries: { path: string }[],
  limit: number,
  filterTag: string | null,
): Promise<LinkRow[]> {
  const results: LinkRow[] = [];
  for (const e of entries) {
    if (results.length >= limit) break;
    if (!e.path.endsWith(".md") || isEncrypted(e.path)) continue;
    const file = await nk.vault.readFile(e.path);
    const link = parseLinkMarkdown(e.path, file.content ?? "");
    if (!link) continue;
    if (filterTag && !link.tags.includes(filterTag)) continue;
    results.push({ id: link.id, title: link.title, url: link.url, tags: link.tags });
  }
  return results;
}

const listCmd = defineCommand({
  meta: { name: "list", description: "List saved links." },
  args: {
    limit: { type: "string", description: "Max rows to print.", required: false },
    tag: { type: "string", description: "Filter by tag.", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const { entries } = await nk.vault.listFiles(`${LINKS_DIR}/`);
      const limit = parseLimit(args.limit, entries.length);
      const filterTag = args.tag ? String(args.tag) : null;

      const results: LinkRow[] = await vaultIsEncrypted()
        ? await collectEncryptedLinks(nk, entries, limit, filterTag)
        : await collectPlaintextLinks(nk, entries, limit, filterTag);

      if (results.length === 0) {
        process.stdout.write(kleur.dim("(no links — add one with `notekit link add <url>`)\n"));
        return;
      }
      for (const l of results) {
        const tagStr = l.tags.length > 0 ? kleur.dim(`  [${l.tags.join(", ")}]`) : "";
        process.stdout.write(`${kleur.dim(l.id)}  ${l.title}  ${kleur.cyan(l.url)}${tagStr}\n`);
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

interface NewLinkFields {
  id: string;
  url: string;
  displayTitle: string;
  platform: string | null;
  folder: string | null;
  tags: string[];
  now: string;
}

async function saveEncryptedLink(nk: NoteKitApi, fields: NewLinkFields): Promise<void> {
  const identity = await requireVaultIdentity();
  const link: SavedLink = {
    id: fields.id,
    path: `${LINKS_DIR}/${fields.id}.md.age`,
    url: fields.url,
    title: fields.displayTitle,
    description: null,
    platform: fields.platform,
    folder: fields.folder,
    tags: fields.tags,
    createdAt: fields.now,
    updatedAt: fields.now,
  };
  const recipients = await recipientsFor(identity);
  const sealed = await serializeEncryptedLink(link, recipients);
  await nk.vault.writeFile(link.path, sealed, `link: save ${fields.id}`);
  process.stdout.write(`${kleur.green("saved (encrypted)")} ${link.path}\n`);
}

async function savePlaintextLink(nk: NoteKitApi, fields: NewLinkFields): Promise<void> {
  const slug = `${slugify(fields.displayTitle)}--${shortFromId(fields.id)}`;
  const folderSegment = fields.folder ? `${fields.folder}/` : "";
  const targetPath = `${LINKS_DIR}/${folderSegment}${slug}.md`;

  const link: Omit<SavedLink, "path" | "encrypted"> = {
    id: fields.id,
    url: fields.url,
    title: fields.displayTitle,
    description: null,
    platform: fields.platform,
    folder: fields.folder,
    tags: fields.tags,
    createdAt: fields.now,
    updatedAt: fields.now,
  };

  const content = serializeLinkMarkdown(link);
  await nk.vault.writeFile(targetPath, content, `link: save ${fields.displayTitle}`);
  process.stdout.write(`${kleur.green("saved")} ${targetPath}\n`);
}

const addCmd = defineCommand({
  meta: { name: "add", description: "Save a URL to the vault." },
  args: {
    url: { type: "positional", description: "URL to save.", required: true },
    title: { type: "string", description: "Optional title (defaults to URL hostname).", required: false },
    tag: { type: "string", description: "Comma-separated tags.", required: false },
    folder: { type: "string", description: "Vault-relative folder (e.g. research/papers).", required: false },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });

      const fields: NewLinkFields = {
        id: generateLinkId(),
        url: String(args.url),
        displayTitle: (args.title ? String(args.title).trim() : "") || titleFromUrl(String(args.url)),
        platform: detectPlatform(String(args.url)),
        folder: args.folder ? String(args.folder).trim() || null : null,
        tags: args.tag ? String(args.tag).split(",").map((t) => t.trim()).filter(Boolean) : [],
        now: new Date().toISOString(),
      };

      if (await vaultIsEncrypted()) {
        await saveEncryptedLink(nk, fields);
      } else {
        await savePlaintextLink(nk, fields);
      }
    } catch (err) {
      dieWithError(err);
    }
  },
});

const rmCmd = defineCommand({
  meta: { name: "rm", description: "Delete a saved link." },
  args: {
    idOrPath: { type: "positional", description: "Link id or vault path.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const path = await resolveLinkPath(nk, String(args.idOrPath));
      const existing = await nk.vault.readFile(path);
      if (!existing.sha) {
        throw new Error(`cannot delete ${path}: no sha returned from server`);
      }
      await nk.vault.deleteFile(path, existing.sha, `link: delete ${path}`);
      process.stdout.write(`${kleur.yellow("removed")} ${path}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const openCmd = defineCommand({
  meta: { name: "open", description: "Print the URL of a saved link to stdout." },
  args: {
    idOrPath: { type: "positional", description: "Link id or vault path.", required: true },
  },
  async run({ args }) {
    try {
      const nk = await getSecretsClient({ requireAuth: true });
      const path = await resolveLinkPath(nk, String(args.idOrPath));
      const file = await nk.vault.readFile(path);
      const content = file.content ?? "";

      if (isEncrypted(path)) {
        const identity = await requireVaultIdentity();
        const link = await deserializeEncryptedLink(path, content, identity.identity);
        if (!link) throw new Error(`couldn't decrypt ${path}`);
        process.stdout.write(`${link.url}\n`);
        return;
      }

      const link = parseLinkMarkdown(path, content);
      if (!link) throw new Error(`couldn't parse ${path}`);
      process.stdout.write(`${link.url}\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

export const linkCommand = defineCommand({
  meta: { name: "link", description: "Save and manage URLs in the vault." },
  subCommands: {
    list: listCmd,
    add: addCmd,
    rm: rmCmd,
    open: openCmd,
  },
});
