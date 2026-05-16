import { apiFetch } from "./api";

export interface VaultRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  updatedAt: string;
}

export interface VaultRef {
  owner: string;
  repo: string;
  branch: string;
}

export interface VaultStatus {
  configured: boolean;
  hasGithubToken: boolean;
  vault: VaultRef | null;
}

export function getStatus(): Promise<VaultStatus> {
  return apiFetch<VaultStatus>("/vault/status");
}

export function listRepos(): Promise<{ repos: VaultRepo[] }> {
  return apiFetch("/vault/repos");
}

export function createRepo(name: string, isPrivate: boolean) {
  return apiFetch<{
    repo: { owner: string; name: string; defaultBranch: string };
  }>("/vault/repos", {
    method: "POST",
    body: JSON.stringify({ name, private: isPrivate }),
  });
}

export function selectVault(owner: string, repo: string, branch?: string) {
  return apiFetch<{ ok: true; vault: VaultRef }>("/vault/select", {
    method: "POST",
    body: JSON.stringify({ owner, repo, branch }),
  });
}

export interface VaultFile {
  path: string;
  sha: string | null;
  content: string | null;
}

export function readFile(path: string): Promise<VaultFile> {
  return apiFetch<VaultFile>(`/vault/file?path=${encodeURIComponent(path)}`);
}

export function writeFile(
  path: string,
  content: string,
  message?: string,
  sha?: string,
): Promise<{ path: string; sha: string }> {
  return apiFetch("/vault/file", {
    method: "PUT",
    body: JSON.stringify({ path, content, message, sha }),
  });
}

export function deleteFile(path: string, sha: string, message?: string) {
  return apiFetch<{ ok: true }>("/vault/file", {
    method: "DELETE",
    body: JSON.stringify({ path, sha, message }),
  });
}

export function listFiles(
  prefix: string,
): Promise<{ entries: { path: string; sha: string }[] }> {
  return apiFetch(`/vault/list?prefix=${encodeURIComponent(prefix)}`);
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

export function listCommits(
  path?: string,
  limit = 50,
): Promise<{ commits: VaultCommit[] }> {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  params.set("limit", String(limit));
  return apiFetch(`/vault/commits?${params.toString()}`);
}

export interface PairAnnouncement {
  code: string;
  pubkey: string;
  deviceName: string;
  deviceId: string;
  expiresAt: string;
}

export function announcePair(payload: {
  code: string;
  pubkey: string;
  deviceName: string;
  deviceId: string;
}): Promise<{ ok: true; expiresAt: string }> {
  return apiFetch("/vault/pair/announce", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchPair(code: string): Promise<PairAnnouncement | null> {
  try {
    return await apiFetch<PairAnnouncement>(`/vault/pair/${encodeURIComponent(code)}`);
  } catch (e) {
    if ((e as Error).message.includes("404")) return null;
    throw e;
  }
}

export function clearPair(code: string): Promise<{ ok: true }> {
  return apiFetch(`/vault/pair/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}
