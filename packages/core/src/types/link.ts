export interface SavedLink {
  id: string;
  path: string;
  url: string;
  title: string;
  description: string | null;
  platform: string | null;
  tags: string[];
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
