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
