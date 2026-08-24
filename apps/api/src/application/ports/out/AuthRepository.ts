import type { PersonalAccessTokenScope } from "../../../domain/auth-tokens";
import type { ProviderName } from "../../../domain/oauth-provider";

/** A personal-access-token row as the /auth/tokens list endpoint returns it. */
export interface PersonalAccessTokenListRow {
  id: string;
  name: string;
  scope: PersonalAccessTokenScope;
  createdAt: number;
  lastUsedAt: number | null;
}

/** The user fields the dev-only auth endpoints read. */
export interface AuthUserRow {
  id: string;
  email: string;
}

/**
 * Outbound port for the auth route's persistence: personal-access-token
 * lifecycle, the GitHub App installation upsert, and the dev-only seed
 * operations. The auth driving route depends on this instead of Drizzle so the
 * queries live in a driven adapter and the route imports zero driven code.
 *
 * Queries are byte-for-byte the same as the previous inline route code — this
 * port only relocates them; it changes no behaviour.
 */
export interface AuthRepository {
  /** Insert a personal access token. `createdAt` omitted lets the column default. */
  insertPersonalAccessToken(input: {
    id: string;
    userId: string;
    name: string;
    tokenHash: string;
    scope: PersonalAccessTokenScope;
    createdAt?: number;
  }): Promise<void>;

  /** Active (non-revoked) PATs for a user, newest first. Hashes never returned. */
  listPersonalAccessTokens(userId: string): Promise<PersonalAccessTokenListRow[]>;

  /**
   * Soft-revoke a PAT (stamp revoked_at). Returns the ids of the rows updated —
   * empty when nothing matched (already revoked / wrong owner / not found).
   */
  revokePersonalAccessToken(
    id: string,
    userId: string,
    revokedAtMs: number,
  ): Promise<{ id: string }[]>;

  /**
   * Insert-or-update a GitHub App installation for a user. When `userToken` is
   * provided, both the user token and refresh token are written; otherwise only
   * the installation id is updated (an existing user token is preserved).
   */
  upsertGithubAppInstallation(input: {
    userId: string;
    installationId: number;
    userToken: string | null;
    refreshToken: string | null;
  }): Promise<void>;

  // ── Dev-only seed operations (never reached in production) ────────────────

  findUserByEmail(email: string): Promise<AuthUserRow | null>;

  insertDevUser(input: {
    id: string;
    email: string;
    name: string;
    avatarUrl: null;
    plan: "plus";
  }): Promise<void>;

  upsertDevForgejoAccount(input: {
    userId: string;
    username: string;
    accessToken: string;
  }): Promise<void>;

  findNotekitDevVault(userId: string): Promise<{ id: string } | null>;

  insertDevVault(input: {
    id: string;
    userId: string;
    provider: "notekit";
    owner: string;
    repo: string;
    branch: string;
    label: string;
  }): Promise<void>;

  setActiveVaultSetting(userId: string, activeVaultId: string): Promise<void>;

  upsertDevGithubOAuthAccount(input: {
    provider: ProviderName;
    providerAccountId: string;
    userId: string;
    accessToken: string;
  }): Promise<void>;

  upsertDevVaultConfigSetting(input: {
    userId: string;
    vaultProvider: "github";
    vaultOwner: string;
    vaultRepo: string;
    vaultBranch: string;
  }): Promise<void>;
}
