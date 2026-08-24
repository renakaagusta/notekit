/**
 * Sign-in OAuth provider types. Apple is implemented in its own driven adapter
 * (`adapters/driven/auth/apple.ts`) because its flow diverges enough (form_post
 * callback, JWT-based client secret, id_token-only profile) that the shared
 * `OAuthProvider` shape below doesn't fit it — but it still appears in this
 * union so the rest of the auth pipeline (`upsertUserFromOAuth`, the schema
 * enum, the provider-aware routes) treats it as a first-class provider.
 *
 * Pure domain values — no transport, no env, no DB.
 */
export type ProviderName = "github" | "google" | "apple";

export interface NormalizedProfile {
  providerAccountId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface OAuthProvider {
  name: ProviderName;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  parseProfile(profile: unknown, accessToken: string): Promise<NormalizedProfile>;
}
