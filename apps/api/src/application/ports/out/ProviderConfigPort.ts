import type { OAuthProvider, ProviderName } from "../../../domain/oauth-provider";

/**
 * Outbound port that resolves the OAuth configuration (endpoints, client
 * credentials, redirect URI, profile parser) for a generic provider. The auth
 * driving route depends on this instead of the concrete `auth/providers`
 * adapter.
 */
export interface ProviderConfigPort {
  getProvider(name: ProviderName): OAuthProvider;
}
