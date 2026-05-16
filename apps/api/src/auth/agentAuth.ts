/**
 * Agent bearer-token auth. An agent presents `Authorization: Bearer <token>`;
 * we hash and look it up in agent_tokens (where revoked_at IS NULL) and resolve
 * the owning user. The token's plaintext is shown to the user ONCE at creation
 * and never persisted.
 */
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import { db, schema } from "../db";

const TOKEN_PREFIX = "nka_"; // "notekit agent"

export function generateAgentToken(): { plain: string; hash: string } {
  const random = randomBytes(32).toString("hex");
  const plain = `${TOKEN_PREFIX}${random}`;
  const hash = hashToken(plain);
  return { plain, hash };
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function newAgentTokenId(): string {
  return nanoid(16);
}

export interface AgentAuthContext {
  userId: string;
  agentSlug: string;
}

/**
 * Extract a bearer token from the Authorization header and resolve it to an
 * agent + user. Returns null if no token is present, the token is malformed,
 * or the token is unknown/revoked.
 */
export async function getActingAgent(c: Context): Promise<AgentAuthContext | null> {
  const header = c.req.header("Authorization") ?? c.req.header("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const plain = match[1]?.trim();
  if (!plain || !plain.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(plain);
  const row = await db.query.agentTokens.findFirst({
    where: and(eq(schema.agentTokens.tokenHash, hash), isNull(schema.agentTokens.revokedAt)),
  });
  if (!row) return null;

  return { userId: row.userId, agentSlug: row.agentSlug };
}
