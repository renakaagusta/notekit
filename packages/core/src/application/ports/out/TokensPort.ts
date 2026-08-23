import type {
  NewPersonalAccessToken,
  PersonalAccessTokenScope,
  PersonalAccessTokenSummary,
} from "@notekit/api-client";

/**
 * Outbound port for the personal-access-token REST surface (list, mint, revoke)
 * used by the CLI and MCP server. The tokens use case depends on this rather
 * than the concrete `nk.auth` transport, so the backend call shape stays behind
 * the composition root. Signatures mirror `nk.auth.*` exactly so the conformance
 * const catches any drift.
 */
export interface TokensPort {
  listTokens(): Promise<{ tokens: PersonalAccessTokenSummary[] }>;
  createToken(input: {
    name: string;
    scope?: PersonalAccessTokenScope;
  }): Promise<NewPersonalAccessToken>;
  revokeToken(id: string): Promise<{ ok: true }>;
}
