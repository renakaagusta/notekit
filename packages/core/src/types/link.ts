import type { InkDocument } from "./ink";

/**
 * Render kind for a saved-URL item. A `link` shows a link card; `image`
 * renders an `<img>` preview; `pdf` opens in the pdf.js viewer. All three
 * share the same on-disk shape (a URL under `links/`) and differ only in
 * how the UI presents the URL. Orthogonal to {@link NoteFormat}. See
 * #25/#26.
 */
export type LinkKind = "link" | "image" | "pdf";

export interface SavedLink {
  id: string;
  path: string;
  url: string;
  title: string;
  description: string | null;
  platform: string | null;
  tags: string[];
  /**
   * How to render the URL: `link` (default), `image`, or `pdf`. Encrypted
   * links keep this inside the ciphertext so the leak surface stays
   * "timestamps + folder only".
   */
  kind?: LinkKind;
  /**
   * Optional ink annotation drawn over the media (#32). Bundled with the
   * item — it encrypts alongside the link and never touches the remote
   * bytes (which we don't own). `null`/absent means un-annotated.
   * Currently populated for `image`; `pdf` annotation awaits pdf.js page
   * rendering (#33).
   */
  annotation?: InkDocument | null;
  /**
   * Vault-relative folder this link lives in, e.g. `research/papers`.
   * `null` means the vault root. Mirrors `Note.folder` so the Links
   * surface can render the same tree UI.
   */
  folder: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * True when this saved link is end-to-end encrypted at
   * `links/<id>.md.age`. The URL is the sensitive field, so when
   * encryption is on the URL, title, description, and tags all live
   * inside the ciphertext — only timestamps, the id, and the folder
   * leak (folder stays public so the tree resolves without unlock).
   */
  encrypted?: boolean;
}
