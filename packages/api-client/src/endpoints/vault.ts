// Vault, file, member, and commit endpoints. Mirrors apps/api/src/routes/vault.ts
// and packages/core/src/lib/vault-api.ts — keep response shapes in sync with
// both if you change the server.

import type { NoteKitClient } from "../transport";
import type {
  CollaboratorPermission,
  VaultCommit,
  VaultFile,
  VaultImportResult,
  VaultInvitation,
  VaultListResponse,
  VaultMember,
  VaultProvider,
  VaultRef,
  VaultRepo,
  VaultSettings,
  VaultStatus,
  VaultSyncResult,
} from "../types";

export function vaultEndpoints(client: NoteKitClient) {
  return {
    // ── status + listing ─────────────────────────────────────────────────
    async status(): Promise<VaultStatus> {
      return client.request<VaultStatus>("/vault/status");
    },
    async listVaults(): Promise<VaultListResponse> {
      return client.request<VaultListResponse>("/vault/vaults");
    },

    // ── BYO GitHub repos ────────────────────────────────────────────────
    async listRepos(): Promise<{ repos: VaultRepo[] }> {
      return client.request("/vault/repos");
    },
    async createRepo(name: string, isPrivate: boolean) {
      return client.request<{
        repo: { owner: string; name: string; defaultBranch: string };
      }>("/vault/repos", { method: "POST", body: { name, private: isPrivate } });
    },

    // ── NoteKit-hosted Forgejo repos ────────────────────────────────────
    async provisionNotekit(): Promise<{ ok: true; username: string; gitUrl: string | null }> {
      return client.request("/vault/notekit/provision", { method: "POST" });
    },
    async listNotekitRepos(): Promise<{ repos: VaultRepo[] }> {
      return client.request("/vault/notekit/repos");
    },
    async createNotekitRepo(name: string, isPrivate: boolean) {
      return client.request<{
        repo: { owner: string; name: string; defaultBranch: string };
      }>("/vault/notekit/repos", { method: "POST", body: { name, private: isPrivate } });
    },

    // ── multi-vault management ──────────────────────────────────────────
    async addVault(input: {
      provider?: VaultProvider;
      owner: string;
      repo: string;
      branch?: string;
      label?: string;
    }): Promise<{ vault: VaultRef; activeId: string }> {
      return client.request("/vault/vaults", {
        method: "POST",
        body: { provider: input.provider ?? "github", ...input },
      });
    },
    async selectVaultById(vaultId: string): Promise<{ activeId: string; vault: VaultRef }> {
      return client.request(`/vault/vaults/${encodeURIComponent(vaultId)}/select`, { method: "POST" });
    },
    async patchVault(
      vaultId: string,
      patch: { label?: string | null; branch?: string },
    ): Promise<{ vault: VaultRef }> {
      return client.request(`/vault/vaults/${encodeURIComponent(vaultId)}`, {
        method: "PATCH",
        body: patch,
      });
    },
    async deleteVault(vaultId: string): Promise<{ ok: true; activeId: string | null }> {
      return client.request(`/vault/vaults/${encodeURIComponent(vaultId)}`, { method: "DELETE" });
    },

    // Legacy: select by owner/repo (predates vault IDs).
    async selectVault(owner: string, repo: string, branch?: string) {
      return client.request<{ ok: true; vault: VaultRef }>("/vault/select", {
        method: "POST",
        body: { owner, repo, branch },
      });
    },

    // ── per-vault settings ──────────────────────────────────────────────
    async getVaultSettings(vaultId: string): Promise<{ settings: VaultSettings }> {
      return client.request(`/vault/vaults/${encodeURIComponent(vaultId)}/settings`);
    },
    async patchVaultSettings(
      vaultId: string,
      patch: Partial<VaultSettings>,
    ): Promise<{ settings: VaultSettings }> {
      return client.request(`/vault/vaults/${encodeURIComponent(vaultId)}/settings`, {
        method: "PATCH",
        body: patch,
      });
    },

    // ── cross-vault import ──────────────────────────────────────────────
    async importFromVault(destVaultId: string, sourceVaultId: string): Promise<VaultImportResult> {
      return client.request(`/vault/vaults/${encodeURIComponent(destVaultId)}/import`, {
        method: "POST",
        body: { sourceId: sourceVaultId },
      });
    },

    // ── files (notes, tickets, links — everything in the vault repo) ────
    async readFile(path: string): Promise<VaultFile> {
      return client.request<VaultFile>("/vault/file", { query: { path } });
    },
    async readFileAtRef(path: string, ref: string): Promise<VaultFile> {
      return client.request<VaultFile>("/vault/file", { query: { path, ref } });
    },
    async writeFile(
      path: string,
      content: string,
      message?: string,
      sha?: string,
    ): Promise<{ path: string; sha: string }> {
      return client.request("/vault/file", {
        method: "PUT",
        body: { path, content, message, sha },
      });
    },
    async deleteFile(path: string, sha: string, message?: string): Promise<{ ok: true }> {
      return client.request("/vault/file", {
        method: "DELETE",
        body: { path, sha, message },
      });
    },
    async listFiles(prefix: string): Promise<{ entries: { path: string; sha: string }[] }> {
      return client.request("/vault/list", { query: { prefix } });
    },

    // ── commits ─────────────────────────────────────────────────────────
    async listCommits(opts: { path?: string; limit?: number } = {}): Promise<{ commits: VaultCommit[] }> {
      return client.request("/vault/commits", {
        query: { path: opts.path, limit: opts.limit ?? 50 },
      });
    },

    // ── sync (proof-of-life, not a real pull/push yet) ──────────────────
    async sync(): Promise<VaultSyncResult> {
      return client.request<VaultSyncResult>("/vault/sync", { method: "POST" });
    },

    // ── members ─────────────────────────────────────────────────────────
    async listVaultMembers(vaultId: string): Promise<{
      members: VaultMember[];
      invitations: VaultInvitation[];
    }> {
      return client.request(`/vault/vaults/${encodeURIComponent(vaultId)}/members`);
    },
    async addVaultMember(
      vaultId: string,
      username: string,
      permission: CollaboratorPermission = "push",
    ): Promise<{ status: "invited" | "added"; invitation: VaultInvitation | null }> {
      return client.request(
        `/vault/vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(username)}`,
        { method: "PUT", body: { permission } },
      );
    },
    async removeVaultMember(vaultId: string, username: string): Promise<{ ok: true }> {
      return client.request(
        `/vault/vaults/${encodeURIComponent(vaultId)}/members/${encodeURIComponent(username)}`,
        { method: "DELETE" },
      );
    },
    async cancelVaultInvitation(vaultId: string, invitationId: number): Promise<{ ok: true }> {
      return client.request(
        `/vault/vaults/${encodeURIComponent(vaultId)}/invitations/${invitationId}`,
        { method: "DELETE" },
      );
    },
  };
}
