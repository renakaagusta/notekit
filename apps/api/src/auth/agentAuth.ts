/**
 * Agent bearer-token auth. An agent presents `Authorization: Bearer <token>`;
 * we hash and look it up in agent_tokens (where revoked_at IS NULL) and resolve
 * the owning user. The token's plaintext is shown to the user ONCE at creation
 * and never persisted.
 *
 * The crypto/id primitives and principal shape live in `domain/auth-tokens`;
 * the DB lookup is behind {@link AgentAuthRepository}, bound from the
 * composition root before first use.
 */
import type { Context } from "hono";
import type { AgentAuthRepository } from "../application/ports/out/AgentAuthRepository";
import { hashToken, parseAgentToken } from "../domain/auth-tokens";
import type { AgentAuthContext } from "../domain/auth-tokens";

export {
  generateAgentToken,
  hashToken,
  newAgentTokenId,
} from "../domain/auth-tokens";
export type { AgentAuthContext } from "../domain/auth-tokens";

let repo: AgentAuthRepository;

/**
 * Bind the agent-token persistence port. Called once from the composition root
 * before any route handler runs; importers pull `getActingAgent` from that root
 * so the wiring is guaranteed to have happened first.
 */
export function configureAgentAuth(r: AgentAuthRepository): void {
  repo = r;
}

/**
 * Extract a bearer token from the Authorization header and resolve it to an
 * agent + user. Returns null if no token is present, the token is malformed,
 * or the token is unknown/revoked.
 */
export async function getActingAgent(c: Context): Promise<AgentAuthContext | null> {
  const header = c.req.header("Authorization") ?? c.req.header("authorization");
  const plain = parseAgentToken(header);
  if (!plain) return null;

  const hash = hashToken(plain);
  const row = await repo.findByHash(hash);
  if (!row) return null;

  return { userId: row.userId, agentSlug: row.agentSlug };
}
