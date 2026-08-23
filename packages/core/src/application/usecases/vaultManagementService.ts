import type { VaultManagementService } from "../ports/in/VaultManagementService";
import type { VaultManagementPort } from "../ports/out/VaultManagementPort";

/**
 * Use case implementing {@link VaultManagementService}: delegates each operation
 * to the injected {@link VaultManagementPort}. The UI depends on this inbound
 * capability, which depends only on the outbound port — the vault-management
 * transport is swappable.
 */
export function createVaultManagementService(
  vault: VaultManagementPort,
): VaultManagementService {
  return {
    getStatus: () => vault.getStatus(),
    listRepos: () => vault.listRepos(),
    githubAppStatus: () => vault.githubAppStatus(),
    provisionNotekit: () => vault.provisionNotekit(),
    getGitlabStatus: () => vault.getGitlabStatus(),
    listVaults: () => vault.listVaults(),
    addVault: (input) => vault.addVault(input),
    selectVault: (owner, repo, branch) => vault.selectVault(owner, repo, branch),
    selectVaultById: (vaultId) => vault.selectVaultById(vaultId),
    patchVault: (vaultId, patch) => vault.patchVault(vaultId, patch),
    deleteVault: (vaultId) => vault.deleteVault(vaultId),
    getVaultSettings: (vaultId) => vault.getVaultSettings(vaultId),
    patchVaultSettings: (vaultId, patch) => vault.patchVaultSettings(vaultId, patch),
    listVaultMembers: (vaultId) => vault.listVaultMembers(vaultId),
    addVaultMember: (vaultId, username, permission) =>
      vault.addVaultMember(vaultId, username, permission),
    removeVaultMember: (vaultId, username) => vault.removeVaultMember(vaultId, username),
    cancelVaultInvitation: (vaultId, invitationId) =>
      vault.cancelVaultInvitation(vaultId, invitationId),
    createRepo: (name, isPrivate) => vault.createRepo(name, isPrivate),
    listGitlabRepos: () => vault.listGitlabRepos(),
    connectGitlab: (token) => vault.connectGitlab(token),
    createGitlabRepo: (name, isPrivate) => vault.createGitlabRepo(name, isPrivate),
    listNotekitRepos: () => vault.listNotekitRepos(),
    createNotekitRepo: (name, isPrivate) => vault.createNotekitRepo(name, isPrivate),
    githubAppRepos: () => vault.githubAppRepos(),
    githubAppCreate: (name, isPrivate) => vault.githubAppCreate(name, isPrivate),
    githubAppInstallUrl: () => vault.githubAppInstallUrl(),
  };
}
