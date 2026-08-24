/**
 * Outbound port for agent-token persistence. The agents use case depends on
 * this instead of Drizzle, so the token-row writes live in a driven adapter.
 *
 * Distinct from {@link AgentAuthRepository} (which only reads a token by hash
 * for request auth); this port owns the create + bulk-revoke writes performed
 * when an agent profile is created or deleted.
 */
export interface AgentTokenRepository {
  /** Insert a freshly-minted agent token row for the given user + agent slug. */
  insertToken(input: {
    id: string;
    userId: string;
    agentSlug: string;
    tokenHash: string;
  }): Promise<void>;

  /** Revoke every non-revoked token for the given user + agent slug. */
  revokeTokensForAgent(userId: string, agentSlug: string, revokedAtMs: number): Promise<void>;
}
