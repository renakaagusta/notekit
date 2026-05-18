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

export type VaultProvider = "github" | "notekit";

export interface VaultRef {
  /** Server-side id. Undefined on responses from older API revisions. */
  id?: string;
  provider?: VaultProvider;
  owner: string;
  repo: string;
  branch: string;
  /** Friendly name for the switcher. */
  label?: string | null;
}

export interface VaultStatus {
  configured: boolean;
  hasGithubToken: boolean;
  vault: VaultRef | null;
}

export interface VaultListResponse {
  activeId: string | null;
  vaults: VaultRef[];
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

// --- Multi-vault API ---

export function listVaults(): Promise<VaultListResponse> {
  return apiFetch<VaultListResponse>("/vault/vaults");
}

export function addVault(input: {
  provider?: VaultProvider;
  owner: string;
  repo: string;
  branch?: string;
  label?: string;
}): Promise<{ vault: VaultRef; activeId: string }> {
  return apiFetch("/vault/vaults", {
    method: "POST",
    body: JSON.stringify({ provider: input.provider ?? "github", ...input }),
  });
}

export function selectVaultById(vaultId: string): Promise<{
  activeId: string;
  vault: VaultRef;
}> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}/select`, {
    method: "POST",
  });
}

export function patchVault(
  vaultId: string,
  patch: { label?: string | null; branch?: string },
): Promise<{ vault: VaultRef }> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteVault(vaultId: string): Promise<{
  ok: true;
  activeId: string | null;
}> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}`, {
    method: "DELETE",
  });
}

// --- Per-vault settings ---

export interface VaultSettings {
  theme: "auto" | "light" | "dark";
  defaultFolder: string | null;
  defaultAgentSlug: string | null;
}

export function getVaultSettings(vaultId: string): Promise<{ settings: VaultSettings }> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}/settings`);
}

export function patchVaultSettings(
  vaultId: string,
  patch: Partial<VaultSettings>,
): Promise<{ settings: VaultSettings }> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}/settings`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

// --- Cross-vault import ---

export interface VaultImportResult {
  imported: number;
  skipped: number;
  errors: { path: string; reason: string }[];
}

export function importFromVault(
  destVaultId: string,
  sourceVaultId: string,
): Promise<VaultImportResult> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(destVaultId)}/import`, {
    method: "POST",
    body: JSON.stringify({ sourceId: sourceVaultId }),
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

export function readFileAtRef(path: string, ref: string): Promise<VaultFile> {
  return apiFetch<VaultFile>(
    `/vault/file?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`,
  );
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

// --- Vault member management ---

export type CollaboratorPermission = "pull" | "push" | "admin" | "maintain" | "triage";

export interface VaultMember {
  login: string;
  avatarUrl: string | null;
  htmlUrl: string;
  permission: CollaboratorPermission;
}

export interface VaultInvitation {
  id: number;
  inviteeLogin: string;
  inviteeAvatar: string | null;
  permission: string;
  createdAt: string;
  htmlUrl: string;
}

export function listVaultMembers(vaultId: string): Promise<{
  members: VaultMember[];
  invitations: VaultInvitation[];
}> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}/members`);
}

export function addVaultMember(
  vaultId: string,
  username: string,
  permission: CollaboratorPermission = "push",
): Promise<{ status: "invited" | "added"; invitation: VaultInvitation | null }> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(username)}`, {
    method: "PUT",
    body: JSON.stringify({ permission }),
  });
}

export function removeVaultMember(vaultId: string, username: string): Promise<{ ok: true }> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(username)}`, {
    method: "DELETE",
  });
}

export function cancelVaultInvitation(vaultId: string, invitationId: number): Promise<{ ok: true }> {
  return apiFetch(`/vault/vaults/${encodeURIComponent(vaultId)}/invitations/${invitationId}`, {
    method: "DELETE",
  });
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
