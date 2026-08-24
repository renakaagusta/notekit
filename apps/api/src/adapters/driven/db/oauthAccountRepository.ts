import { and, eq } from "drizzle-orm";
import type {
  OAuthAccountRepository,
  OAuthAccountRow,
  OAuthProvider,
} from "../../../application/ports/out/OAuthAccountRepository";
import { db, schema } from ".";

/** Drizzle/Postgres implementation of {@link OAuthAccountRepository}. */
export const oauthAccountRepository: OAuthAccountRepository = {
  async findByProviderAccount(
    provider: OAuthProvider,
    providerAccountId: string,
  ): Promise<OAuthAccountRow | null> {
    const row = await db.query.oauthAccounts.findFirst({
      where: and(
        eq(schema.oauthAccounts.provider, provider),
        eq(schema.oauthAccounts.providerAccountId, providerAccountId),
      ),
    });
    return row ? { userId: row.userId } : null;
  },

  async updateAccessToken(
    provider: OAuthProvider,
    providerAccountId: string,
    encryptedToken: string,
  ): Promise<void> {
    await db
      .update(schema.oauthAccounts)
      .set({ accessToken: encryptedToken })
      .where(
        and(
          eq(schema.oauthAccounts.provider, provider),
          eq(schema.oauthAccounts.providerAccountId, providerAccountId),
        ),
      );
  },

  async insert(input): Promise<void> {
    await db.insert(schema.oauthAccounts).values({
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      userId: input.userId,
      accessToken: input.accessToken,
    });
  },

  async deleteForUser(provider: OAuthProvider, userId: string): Promise<void> {
    await db
      .delete(schema.oauthAccounts)
      .where(
        and(
          eq(schema.oauthAccounts.provider, provider),
          eq(schema.oauthAccounts.userId, userId),
        ),
      );
  },
};
