/**
 * Outbound port for agent-token lookups. Auth depends on this instead of
 * Drizzle so the agent-token query lives in a driven adapter and the auth
 * logic can be exercised with an in-memory fake.
 */
export interface AgentAuthRepository {
  /**
   * The non-revoked agent token matching the given sha256 hash, or null when no
   * such active token exists. Revoked tokens (revoked_at IS NOT NULL) never
   * match.
   */
  findByHash(hash: string): Promise<{ userId: string; agentSlug: string } | null>;
}
