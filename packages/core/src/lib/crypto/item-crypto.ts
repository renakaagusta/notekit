/**
 * Per-item end-to-end encryption for notes, tickets, and saved links.
 *
 * Encrypted items live at `<kind>/<id>.md.age` instead of the usual
 * `<kind>/<slug>--<id>.md`. The file is a tiny YAML frontmatter block
 * — listing only the public metadata that server-side views need
 * (status/dueDate for tickets, folder for notes, nothing for links) —
 * followed by an age-armored payload that holds every private field
 * (title, body, URL, assignee, …).
 *
 * The recipient set is the same one that protects the secrets vault:
 * every active device pubkey plus the BIP39 recovery pubkey. Users
 * who already set up crypto for secrets don't pick a new passphrase
 * — their existing devices decrypt, and the recovery phrase is the
 * only out-of-band material to back up.
 *
 * Why this split:
 *
 *   notes/  — body-only encryption; folder stays visible so the
 *             sidebar tree still resolves. Title is derived from
 *             the body's first line, so encrypting the body hides
 *             the title automatically.
 *   tickets/ — status, priority, dueDate stay visible so the board
 *             renders the card in the right column at the right
 *             time. Title, body, assignee, labels are encrypted.
 *   links/  — only timestamps leak. URL is the sensitive field
 *             and lives inside the ciphertext.
 *
 * The leak surface is: counts per kind, creation/update times,
 * ticket states/priorities/due dates, note folder layout. Everything
 * else is opaque to the operator and to anyone with repo access but
 * no recipient identity.
 */

import { encryptSecrets, decryptSecrets } from "./vault-crypto";
import type { Note } from "../../types/note";
import type {
  Ticket,
  TicketStatus,
  TicketPriority,
} from "../../types/ticket";
import type { SavedLink } from "../../types/link";

export type EncryptedItemKind = "note" | "ticket" | "link";

/** Fields hidden inside the age ciphertext for each kind. */
export interface EncryptedNotePayload {
  title: string;
  body: string;
  tags: string[];
}
export interface EncryptedTicketPayload {
  title: string;
  body: string;
  assignee: string | null;
  labels: string[];
  linkedNotes: string[];
  createdBy: string | null;
}
export interface EncryptedLinkPayload {
  title: string;
  url: string;
  description: string | null;
  platform: string | null;
  tags: string[];
}

/** Public frontmatter ships in plaintext for each kind. */
export interface NotePublicFrontmatter {
  v: 1;
  encrypted: true;
  kind: "note";
  id: string;
  createdAt: string;
  updatedAt: string;
  folder: string | null;
}
export interface TicketPublicFrontmatter {
  v: 1;
  encrypted: true;
  kind: "ticket";
  id: string;
  createdAt: string;
  updatedAt: string;
  status: TicketStatus;
  priority: TicketPriority;
  dueDate: string | null;
}
export interface LinkPublicFrontmatter {
  v: 1;
  encrypted: true;
  kind: "link";
  id: string;
  createdAt: string;
  updatedAt: string;
  folder: string | null;
}

export type PublicFrontmatter =
  | NotePublicFrontmatter
  | TicketPublicFrontmatter
  | LinkPublicFrontmatter;

/** First line of every armored age payload — used to validate envelopes. */
const AGE_BEGIN = "-----BEGIN AGE ENCRYPTED FILE-----";

// ── Per-surface split / merge ───────────────────────────────────────────

export function splitNoteForEncryption(note: Note): {
  publicFm: NotePublicFrontmatter;
  payload: EncryptedNotePayload;
} {
  return {
    publicFm: {
      v: 1,
      encrypted: true,
      kind: "note",
      id: note.id,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      folder: note.folder,
    },
    payload: {
      title: note.title ?? "",
      body: note.body,
      tags: note.tags,
    },
  };
}

export function mergeEncryptedNote(
  path: string,
  fm: NotePublicFrontmatter,
  payload: EncryptedNotePayload,
): Note {
  return {
    id: fm.id,
    path,
    title: payload.title,
    body: payload.body,
    frontmatter: {},
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt,
    folder: fm.folder,
    tags: payload.tags,
  };
}

export function splitTicketForEncryption(t: Ticket): {
  publicFm: TicketPublicFrontmatter;
  payload: EncryptedTicketPayload;
} {
  return {
    publicFm: {
      v: 1,
      encrypted: true,
      kind: "ticket",
      id: t.id,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
    },
    payload: {
      title: t.title,
      body: t.body,
      assignee: t.assignee,
      labels: t.labels,
      linkedNotes: t.linkedNotes,
      createdBy: t.createdBy,
    },
  };
}

export function mergeEncryptedTicket(
  path: string,
  fm: TicketPublicFrontmatter,
  payload: EncryptedTicketPayload,
): Ticket {
  return {
    id: fm.id,
    path,
    title: payload.title,
    body: payload.body,
    status: fm.status,
    priority: fm.priority,
    assignee: payload.assignee,
    labels: payload.labels,
    linkedNotes: payload.linkedNotes,
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt,
    dueDate: fm.dueDate,
    createdBy: payload.createdBy,
  };
}

export function splitLinkForEncryption(l: SavedLink): {
  publicFm: LinkPublicFrontmatter;
  payload: EncryptedLinkPayload;
} {
  return {
    publicFm: {
      v: 1,
      encrypted: true,
      kind: "link",
      id: l.id,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      folder: l.folder ?? null,
    },
    payload: {
      title: l.title,
      url: l.url,
      description: l.description,
      platform: l.platform,
      tags: l.tags,
    },
  };
}

export function mergeEncryptedLink(
  path: string,
  fm: LinkPublicFrontmatter,
  payload: EncryptedLinkPayload,
): SavedLink {
  return {
    id: fm.id,
    path,
    url: payload.url,
    title: payload.title,
    description: payload.description,
    platform: payload.platform,
    tags: payload.tags,
    folder: fm.folder ?? null,
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt,
  };
}

// ── File format ─────────────────────────────────────────────────────────

function emitPublicFrontmatter(fm: PublicFrontmatter): string {
  // Stable key order so the same item always serializes byte-equal. Values
  // are JSON-quoted for safety; this is a strict subset of YAML that we own
  // — the API never parses it, only this module does.
  const lines: string[] = ["---"];
  for (const [k, v] of orderedEntries(fm)) {
    if (v === null) lines.push(`${k}: null`);
    else if (typeof v === "boolean" || typeof v === "number")
      lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${JSON.stringify(String(v))}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function orderedEntries(fm: PublicFrontmatter): [string, unknown][] {
  const fixed = ["v", "encrypted", "kind", "id", "createdAt", "updatedAt"];
  const out: [string, unknown][] = [];
  const obj = fm as unknown as Record<string, unknown>;
  for (const k of fixed) {
    if (k in obj) out.push([k, obj[k]]);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!fixed.includes(k)) out.push([k, v]);
  }
  return out;
}

function parseSimpleFrontmatter(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const raw of yaml.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rest] = m;
    if (!key) continue;
    out[key] = parseYamlValue(rest ?? "");
  }
  return out;
}

function parseYamlValue(raw: string): unknown {
  const v = raw.trim();
  if (v === "null" || v === "") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      // Fall through to raw string.
    }
  }
  return v;
}

// ── Payload encrypt / decrypt ───────────────────────────────────────────

/**
 * Encrypt a JSON-serializable payload for `recipients`. Returns the
 * armored ciphertext (multi-line text — the part that lives below the
 * plaintext frontmatter in the on-disk file).
 */
export async function encryptItemPayload(
  payload: unknown,
  recipients: string[],
): Promise<string> {
  if (recipients.length === 0) {
    throw new Error("encryptItemPayload requires at least one recipient");
  }
  return encryptSecrets(JSON.stringify(payload), recipients);
}

/**
 * Decrypt an armored ciphertext using a single age identity (typically
 * this device's identity, or the recovery identity). Throws if the
 * identity can't unwrap the file key.
 */
export async function decryptItemPayload<T>(
  armored: string,
  identity: string,
): Promise<T> {
  const json = await decryptSecrets(armored, identity);
  return JSON.parse(json) as T;
}

// ── End-to-end serialize / deserialize ──────────────────────────────────

export async function serializeEncryptedNote(
  note: Note,
  recipients: string[],
): Promise<string> {
  const { publicFm, payload } = splitNoteForEncryption(note);
  const ciphertext = await encryptItemPayload(payload, recipients);
  return `${emitPublicFrontmatter(publicFm)}\n${ciphertext}\n`;
}

export async function serializeEncryptedTicket(
  ticket: Ticket,
  recipients: string[],
): Promise<string> {
  const { publicFm, payload } = splitTicketForEncryption(ticket);
  const ciphertext = await encryptItemPayload(payload, recipients);
  return `${emitPublicFrontmatter(publicFm)}\n${ciphertext}\n`;
}

export async function serializeEncryptedLink(
  link: SavedLink,
  recipients: string[],
): Promise<string> {
  const { publicFm, payload } = splitLinkForEncryption(link);
  const ciphertext = await encryptItemPayload(payload, recipients);
  return `${emitPublicFrontmatter(publicFm)}\n${ciphertext}\n`;
}

export interface EncryptedItemEnvelope {
  fm: PublicFrontmatter;
  ciphertext: string;
}

/**
 * Split a `.md.age` file into its plaintext header and armored ciphertext.
 * Returns null if the content isn't a valid encrypted item envelope —
 * callers should treat that as "not one of ours" and skip.
 */
export function parseEncryptedEnvelope(
  content: string,
): EncryptedItemEnvelope | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const yaml = content.slice(4, end);
  const rest = content.slice(end + 4).replace(/^\n/, "");

  const raw = parseSimpleFrontmatter(yaml);
  if (raw.encrypted !== true) return null;
  if (raw.v !== 1) return null;
  if (raw.kind !== "note" && raw.kind !== "ticket" && raw.kind !== "link") {
    return null;
  }
  if (typeof raw.id !== "string" || !raw.id) return null;
  if (!rest.startsWith(AGE_BEGIN)) return null;

  return {
    fm: raw as unknown as PublicFrontmatter,
    ciphertext: rest.trimEnd(),
  };
}

export async function deserializeEncryptedNote(
  path: string,
  content: string,
  identity: string,
): Promise<Note | null> {
  const env = parseEncryptedEnvelope(content);
  if (!env || env.fm.kind !== "note") return null;
  const payload = await decryptItemPayload<EncryptedNotePayload>(
    env.ciphertext,
    identity,
  );
  return mergeEncryptedNote(path, env.fm, payload);
}

export async function deserializeEncryptedTicket(
  path: string,
  content: string,
  identity: string,
): Promise<Ticket | null> {
  const env = parseEncryptedEnvelope(content);
  if (!env || env.fm.kind !== "ticket") return null;
  const payload = await decryptItemPayload<EncryptedTicketPayload>(
    env.ciphertext,
    identity,
  );
  return mergeEncryptedTicket(path, env.fm, payload);
}

export async function deserializeEncryptedLink(
  path: string,
  content: string,
  identity: string,
): Promise<SavedLink | null> {
  const env = parseEncryptedEnvelope(content);
  if (!env || env.fm.kind !== "link") return null;
  const payload = await decryptItemPayload<EncryptedLinkPayload>(
    env.ciphertext,
    identity,
  );
  return mergeEncryptedLink(path, env.fm, payload);
}

/**
 * Classify a vault path without decrypting it. Returns the item kind for
 * a `<kind>/<id>.md.age` file, or `null` otherwise. Used by MCP to count
 * skipped items and by the sync layer to fan out by kind.
 */
export function classifyEncryptedPath(path: string): EncryptedItemKind | null {
  if (!path.endsWith(".md.age")) return null;
  if (path.startsWith("notes/")) return "note";
  if (path.startsWith("tickets/")) return "ticket";
  if (path.startsWith("links/")) return "link";
  return null;
}

/** True if `path` is any kind of encrypted item file. */
export function isEncryptedItemPath(path: string): boolean {
  return classifyEncryptedPath(path) !== null;
}
