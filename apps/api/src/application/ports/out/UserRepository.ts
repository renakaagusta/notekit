import type { ProviderName } from "../../../domain/oauth-provider";

/**
 * Outbound port for OAuth user/account persistence. The upsert use case depends
 * on this instead of Drizzle, so the Postgres queries live in a driven adapter.
 *
 * `accessToken` values crossing this boundary are already encrypted by the use
 * case — the repository persists them verbatim.
 */
export interface UserRepository {
  /**
   * The existing oauth_account row for this provider + account id, or null when
   * the account has never signed in before.
   */
  findOAuthAccount(
    provider: ProviderName,
    providerAccountId: string,
  ): Promise<{ userId: string } | null>;

  /** Update the stored (encrypted) access token for an existing oauth_account. */
  updateOAuthAccessToken(
    provider: ProviderName,
    providerAccountId: string,
    encryptedAccessToken: string,
  ): Promise<void>;

  /** The user row matching this email, or null when no user has it yet. */
  findUserByEmail(email: string): Promise<{ id: string } | null>;

  /** Generate a new user id (`nanoid(16)`). */
  newUserId(): string;

  /** Insert a new user row. */
  insertUser(user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    plan: "free";
  }): Promise<void>;

  /** Insert a new oauth_account row linking a provider account to a user. */
  insertOAuthAccount(account: {
    provider: ProviderName;
    providerAccountId: string;
    userId: string;
    encryptedAccessToken: string;
  }): Promise<void>;
}
