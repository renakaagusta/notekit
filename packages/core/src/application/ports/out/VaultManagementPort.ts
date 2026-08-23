import type {
  VaultRef,
  VaultStatus,
  VaultListResponse,
  VaultRepo,
  VaultProvider,
  VaultSettings,
  VaultMember,
  VaultInvitation,
  CollaboratorPermission,
} from "../../../domain/entities/vault";

/**
 * Outbound port for the vault-management REST surface (vaults, settings,
 * members, repo provisioning across providers). The vault-management use case
 * depends on this rather than the concrete `vault-api` transport, so the backend
 * call shape stays behind the composition root. Signatures mirror `vault-api`
 * exactly so the conformance annotation catches any drift.
 */
export interface VaultManagementPort {
  getStatus(): Promise<VaultStatus>;
  listRepos(): Promise<{ repos: VaultRepo[] }>;
  githubAppStatus(): Promise<{
    configured: boolean;
    installed: boolean;
    slug?: string | null;
    accountLogin?: string | null;
  }>;
  provisionNotekit(): Promise<{
    ok: true;
    username: string;
    gitUrl: string | null;
  }>;
  getGitlabStatus(): Promise<{
    connected: boolean;
    login: string | null;
    reason?: "token_invalid";
  }>;
  listVaults(): Promise<VaultListResponse>;
  addVault(input: {
    provider?: VaultProvider;
    owner: string;
    repo: string;
    branch?: string;
    label?: string;
  }): Promise<{ vault: VaultRef; activeId: string }>;
  selectVault(
    owner: string,
    repo: string,
    branch?: string,
  ): Promise<{ ok: true; vault: VaultRef }>;
  selectVaultById(vaultId: string): Promise<{ activeId: string; vault: VaultRef }>;
  patchVault(
    vaultId: string,
    patch: { label?: string | null; branch?: string },
  ): Promise<{ vault: VaultRef }>;
  deleteVault(vaultId: string): Promise<{ ok: true; activeId: string | null }>;
  getVaultSettings(vaultId: string): Promise<{ settings: VaultSettings }>;
  patchVaultSettings(
    vaultId: string,
    patch: Partial<VaultSettings>,
  ): Promise<{ settings: VaultSettings }>;
  listVaultMembers(vaultId: string): Promise<{
    members: VaultMember[];
    invitations: VaultInvitation[];
  }>;
  addVaultMember(
    vaultId: string,
    username: string,
    permission?: CollaboratorPermission,
  ): Promise<{ status: "invited" | "added"; invitation: VaultInvitation | null }>;
  removeVaultMember(vaultId: string, username: string): Promise<{ ok: true }>;
  cancelVaultInvitation(vaultId: string, invitationId: number): Promise<{ ok: true }>;
  createRepo(
    name: string,
    isPrivate: boolean,
  ): Promise<{ repo: { owner: string; name: string; defaultBranch: string } }>;
  listGitlabRepos(): Promise<{ repos: VaultRepo[] }>;
  connectGitlab(token: string): Promise<{ ok: true; login: string }>;
  createGitlabRepo(
    name: string,
    isPrivate: boolean,
  ): Promise<{ repo: { owner: string; name: string; defaultBranch: string } }>;
  listNotekitRepos(): Promise<{ repos: VaultRepo[] }>;
  createNotekitRepo(
    name: string,
    isPrivate: boolean,
  ): Promise<{ repo: { owner: string; name: string; defaultBranch: string } }>;
  githubAppRepos(): Promise<{ repos: VaultRepo[] }>;
  githubAppCreate(
    name: string,
    isPrivate: boolean,
  ): Promise<{ owner: string; name: string; defaultBranch: string }>;
  githubAppInstallUrl(): string;
}
