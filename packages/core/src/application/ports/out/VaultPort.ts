/**
 * Outbound port for the git-backed vault's file storage: the read/write/commit
 * surface the application needs. Concrete transport (HTTP → apps/api → git) is a
 * driven adapter that implements this; use cases depend on the port, never the
 * transport, so they can run against an in-memory vault in tests.
 *
 * This is the file-storage subset only — repo/vault management, members, and
 * device pairing are separate concerns with their own ports.
 */

export interface VaultFile {
  path: string;
  sha: string | null;
  content: string | null;
}

export interface VaultFileEntry {
  path: string;
  sha: string;
}

export interface VaultCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorLogin: string | null;
  authorAvatar: string | null;
  authoredAt: string;
  url: string;
}

export interface VaultPort {
  readFile(path: string): Promise<VaultFile>;
  readFileAtRef(path: string, ref: string): Promise<VaultFile>;
  writeFile(
    path: string,
    content: string,
    message?: string,
    sha?: string,
  ): Promise<{ path: string; sha: string }>;
  commitFiles(
    files: { path: string; content: string }[],
    message?: string,
  ): Promise<{ commitSha: string }>;
  deleteFile(path: string, sha: string, message?: string): Promise<{ ok: true }>;
  listFiles(prefix: string): Promise<{ entries: VaultFileEntry[] }>;
  listCommits(path?: string, limit?: number): Promise<{ commits: VaultCommit[] }>;
}
