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
}

export interface Folder {
  path: string;
  name: string;
  parent: string | null;
}
