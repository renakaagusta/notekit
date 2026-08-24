import type { GitProvider } from "../../../domain/git-provider";

/**
 * The subset of a stored vault row the vault-shared helpers read when resolving
 * the user's active vault. Mirrors the driven vault store's `VaultRow` fields
 * that `resolveVault` projects — id, owner, repo, branch, provider.
 */
export interface ActiveVaultRow {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  provider: GitProvider;
}

/**
 * Outbound port for reading the user's active vault. The vault-shared driving
 * helpers depend on this instead of the concrete `vault/store` adapter.
 */
export interface VaultStorePort {
  getActiveVault(userId: string): Promise<ActiveVaultRow | null>;
}
