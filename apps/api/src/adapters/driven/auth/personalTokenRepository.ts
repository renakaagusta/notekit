import { and, eq, isNull } from "drizzle-orm";
import type { PersonalTokenRepository } from "../../../application/ports/out/PersonalTokenRepository";
import { db, schema } from "../db";

/** Drizzle/Postgres implementation of {@link PersonalTokenRepository}. */
export const personalTokenRepository: PersonalTokenRepository = {
  async findByHash(hash) {
    const row = await db.query.personalAccessTokens.findFirst({
      where: and(
        eq(schema.personalAccessTokens.tokenHash, hash),
        isNull(schema.personalAccessTokens.revokedAt),
      ),
    });
    if (!row) return null;
    return { id: row.id, userId: row.userId, scope: row.scope };
  },
  async touchLastUsed(id, usedAtMs) {
    await db
      .update(schema.personalAccessTokens)
      .set({ lastUsedAt: usedAtMs })
      .where(eq(schema.personalAccessTokens.id, id));
  },
};
