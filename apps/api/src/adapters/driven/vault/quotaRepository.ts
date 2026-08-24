import { eq } from "drizzle-orm";
import type { QuotaRepository } from "../../../application/ports/out/QuotaRepository";
import { db, schema } from "../db";
import * as fj from "../git/forgejo";
import { getForgejoToken } from "./forgejoAccounts";

/** Drizzle/Postgres + Forgejo implementation of {@link QuotaRepository}. */
export const quotaRepository: QuotaRepository = {
  async getForgejoAccount(userId) {
    const row = await db.query.forgejoAccounts.findFirst({
      where: eq(schema.forgejoAccounts.userId, userId),
    });
    if (!row) return null;
    return {
      quotaBytes: row.quotaBytes ?? null,
      usedBytes: row.usedBytes,
      usageUpdatedAt: row.usageUpdatedAt,
    };
  },
  async getUserForPlus(userId) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    return user ?? null;
  },
  async setUsage(userId, usedBytes, usageUpdatedAt) {
    await db
      .update(schema.forgejoAccounts)
      .set({ usedBytes, usageUpdatedAt })
      .where(eq(schema.forgejoAccounts.userId, userId));
  },
  async getForgejoToken(userId) {
    return getForgejoToken(userId);
  },
  async listRepoSizesKib(token) {
    const repos = await fj.listRepos(token);
    return repos.map((r) => r.size ?? 0);
  },
};
