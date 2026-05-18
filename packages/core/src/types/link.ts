export interface SavedLink {
  id: string;
  path: string;
  url: string;
  title: string;
  description: string | null;
  platform: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
