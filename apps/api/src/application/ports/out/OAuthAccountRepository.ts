/**
 * The identity providers backed by an `oauth_accounts` row. NoteKit's managed
 * Forgejo backend is stored elsewhere, so it is deliberately excluded here.
 */
export type OAuthProvider = "github" | "google" | "apple" | "gitlab";

/** A stored OAuth-account row's identity, as the provider use case reads it. */
export interface OAuthAccountRow {
  userId: string;
}

/**
 * Outbound port for the `oauth_accounts` rows that back the BYO git providers
 * (GitHub / GitLab PAT connections). The vault provider use case depends on
 * this instead of Drizzle directly.
 */
export interface OAuthAccountRepository {
  findByProviderAccount(
    provider: OAuthProvider,
    providerAccountId: string,
  ): Promise<OAuthAccountRow | null>;
  updateAccessToken(
    provider: OAuthProvider,
    providerAccountId: string,
    encryptedToken: string,
  ): Promise<void>;
  insert(input: {
    provider: OAuthProvider;
    providerAccountId: string;
    userId: string;
    accessToken: string;
  }): Promise<void>;
  deleteForUser(provider: OAuthProvider, userId: string): Promise<void>;
}
