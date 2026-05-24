import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";
import type { SavedLink } from "../types/link";
import { noteTitle } from "./note-display";

export function slugify(text: string): string {
  const ascii = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function shortId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) || "x";
}

const FOLDER_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FOLDER_MAX_LEN = 120;

/**
 * Normalize a folder string into a safe vault-relative path or `null`.
 * Rejects `..`, leading slashes, NUL/control chars, and segments that
 * wouldn't survive a round-trip through the GitHub Contents API.
 *
 * Callers in the UI may pass user input directly; this is the boundary.
 * Server-side, the same shape is enforced via `validation.ts` schemas.
 */
export function sanitizeFolderPath(folder: string | null | undefined): string | null {
  if (folder === null || folder === undefined) return null;
  if (folder.length > FOLDER_MAX_LEN) return null;
  if (/[\u0000-\u001f]/.test(folder)) return null;
  const trimmed = folder.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return null;
  const segments = trimmed
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (seg === "." || seg === "..") return null;
    if (!FOLDER_SEGMENT_RE.test(seg)) return null;
  }
  return segments.join("/");
}

function folderSegment(folder: string | null | undefined): string {
  const safe = sanitizeFolderPath(folder);
  if (!safe) return "";
  // Even after sanitization, slugify each segment so the on-disk path is
  // url/git-friendly. Sanitization is the security gate; slugify is cosmetic.
  const cleaned = safe
    .split("/")
    .map((s) => slugify(s))
    .filter(Boolean)
    .join("/");
  return cleaned ? `${cleaned}/` : "";
}

export function notePathFor(
  note: Pick<Note, "id" | "body" | "folder"> & { title?: string },
): string {
  const title = noteTitle({ body: note.body, title: note.title ?? "" });
  const slug = slugify(title) || "untitled";
  return `notes/${folderSegment(note.folder)}${slug}--${shortId(note.id)}.md`;
}

export function ticketPathFor(t: Pick<Ticket, "id" | "title">): string {
  const slug = slugify(t.title || "") || "untitled";
  return `tickets/${slug}--${shortId(t.id)}.md`;
}

export function linkPathFor(
  l: Pick<SavedLink, "id" | "title"> & { folder?: string | null },
): string {
  const slug = slugify(l.title || "") || "link";
  return `links/${folderSegment(l.folder)}${slug}--${shortId(l.id)}.md`;
}

// ── Encrypted item paths ─────────────────────────────────────────────────
//
// Encrypted items use opaque filenames — a human-readable slug would leak
// the title (or, for links, the URL), so we drop it and keep the full id
// under `.md.age`. The folder for notes stays in the public frontmatter,
// not the path, so the path layout itself doesn't leak folder names.

const ENCRYPTED_SUFFIX = ".md.age";

export function encryptedNotePathFor(note: Pick<Note, "id">): string {
  return `notes/${note.id}${ENCRYPTED_SUFFIX}`;
}

export function encryptedTicketPathFor(t: Pick<Ticket, "id">): string {
  return `tickets/${t.id}${ENCRYPTED_SUFFIX}`;
}

export function encryptedLinkPathFor(l: Pick<SavedLink, "id">): string {
  return `links/${l.id}${ENCRYPTED_SUFFIX}`;
}

/** True for any encrypted item path (`<kind>/<id>.md.age`). */
export function isEncryptedItemPath(path: string): boolean {
  return path.endsWith(ENCRYPTED_SUFFIX);
}
