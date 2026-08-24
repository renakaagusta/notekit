import { and, eq, isNull } from "drizzle-orm";
import type { AgentAuthRepository } from "../../../application/ports/out/AgentAuthRepository";
import { db, schema } from "../db";

/** Drizzle/Postgres implementation of {@link AgentAuthRepository}. */
export const agentAuthRepository: AgentAuthRepository = {
  async findByHash(hash) {
    const row = await db.query.agentTokens.findFirst({
      where: and(eq(schema.agentTokens.tokenHash, hash), isNull(schema.agentTokens.revokedAt)),
    });
    if (!row) return null;
    return { userId: row.userId, agentSlug: row.agentSlug };
  },
};
