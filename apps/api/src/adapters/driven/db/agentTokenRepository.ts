import { and, eq, isNull } from "drizzle-orm";
import type { AgentTokenRepository } from "../../../application/ports/out/AgentTokenRepository";
import { db, schema } from ".";

/** Drizzle/Postgres implementation of {@link AgentTokenRepository}. */
export const agentTokenRepository: AgentTokenRepository = {
  async insertToken(input) {
    await db.insert(schema.agentTokens).values({
      id: input.id,
      userId: input.userId,
      agentSlug: input.agentSlug,
      tokenHash: input.tokenHash,
    });
  },
  async revokeTokensForAgent(userId, agentSlug, revokedAtMs) {
    await db
      .update(schema.agentTokens)
      .set({ revokedAt: revokedAtMs })
      .where(
        and(
          eq(schema.agentTokens.userId, userId),
          eq(schema.agentTokens.agentSlug, agentSlug),
          isNull(schema.agentTokens.revokedAt),
        ),
      );
  },
};
