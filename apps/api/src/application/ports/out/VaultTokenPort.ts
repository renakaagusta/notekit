import type { GitProvider } from "../../../domain/git-provider";

/**
 * Minimal projection of a vault row the agents use case needs to address the
 * git backend. Mirrors the fields it reads from the driven vault store's
 * `VaultRow` — provider, owner, repo, branch.
 */
export interface ActiveVault {
  provider: GitProvider;
  owner: string;
  repo: string;
  branch: string;
}

/**
 * Outbound port that resolves a user's active vault and the access token for
 * that vault's backend. The agents use case depends on this instead of the
 * concrete `vault/tokens` adapter.
 */
export interface VaultTokenPort {
  getActiveVaultToken(
    userId: string,
  ): Promise<{ vault: ActiveVault | null; token: string | null }>;
  getVaultToken(userId: string, provider: GitProvider): Promise<string | null>;
}
