import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { UserRepository } from "../../../application/ports/out/UserRepository";
import { db, schema } from "../db";

/** Drizzle/Postgres implementation of {@link UserRepository}. */
export const userRepository: UserRepository = {
  async findOAuthAccount(provider, providerAccountId) {
    const existing = await db.query.oauthAccounts.findFirst({
      where: and(
        eq(schema.oauthAccounts.provider, provider),
        eq(schema.oauthAccounts.providerAccountId, providerAccountId),
      ),
    });
    if (!existing) return null;
    return { userId: existing.userId };
  },
  async updateOAuthAccessToken(provider, providerAccountId, encryptedAccessToken) {
    await db
      .update(schema.oauthAccounts)
      .set({ accessToken: encryptedAccessToken })
      .where(
        and(
          eq(schema.oauthAccounts.provider, provider),
          eq(schema.oauthAccounts.providerAccountId, providerAccountId),
        ),
      );
  },
  async findUserByEmail(email) {
    const byEmail = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    if (!byEmail) return null;
    return { id: byEmail.id };
  },
  newUserId() {
    return nanoid(16);
  },
  async insertUser(user) {
    await db.insert(schema.users).values({
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      plan: user.plan,
    });
  },
  async insertOAuthAccount(account) {
    await db.insert(schema.oauthAccounts).values({
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      userId: account.userId,
      accessToken: account.encryptedAccessToken,
    });
  },
};
