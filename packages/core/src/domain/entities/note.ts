/**
 * Body content format for an authored item. `md` is the default and
 * historical behavior; `html` lets a note carry a sanitized HTML body
 * (e.g. a web clip); `ink` stores a vector pen drawing (the body is an
 * `InkDocument` JSON, see #29/#31). This axis is orthogonal to the
 * saved-URL `kind` on {@link SavedLink}. See #25/#26.
 */
export type NoteFormat = "md" | "html" | "ink";

export interface Note {
  id: string;
  path: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  folder: string | null;
  tags: string[];
  /**
   * Body format. Absent or `md` for ordinary markdown notes (the
   * default); `html` when the body holds sanitized HTML. Encrypted
   * notes keep this inside the ciphertext so it never widens the leak
   * surface.
   */
  format?: NoteFormat;
  /**
   * True when this note is end-to-end encrypted at
   * `notes/<id>.md.age`. The sync layer reads/writes encrypted items
   * via the age envelope; the UI surfaces a 🔒 affordance. Omit (or
   * leave false) for plaintext notes — the default.
   */
  encrypted?: boolean;
}

export interface Folder {
  path: string;
  name: string;
  parent: string | null;
}
