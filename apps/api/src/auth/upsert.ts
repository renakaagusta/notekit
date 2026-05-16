import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { encryptToken } from "./tokenCrypto";
import type { NormalizedProfile, ProviderName } from "./providers";

export async function upsertUserFromOAuth(
  provider: ProviderName,
  profile: NormalizedProfile,
  accessToken: string,
): Promise<string> {
  // 1. Try to find an existing oauth_account row.
  const existing = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(schema.oauthAccounts.provider, provider),
      eq(schema.oauthAccounts.providerAccountId, profile.providerAccountId),
    ),
  });

  const encrypted = encryptToken(accessToken);

  if (existing) {
    // Update tokens, keep user.
    await db
      .update(schema.oauthAccounts)
      .set({ accessToken: encrypted })
      .where(
        and(
          eq(schema.oauthAccounts.provider, provider),
          eq(schema.oauthAccounts.providerAccountId, profile.providerAccountId),
        ),
      );
    return existing.userId;
  }

  // 2. No oauth_account yet. Try to link by email.
  const byEmail = await db.query.users.findFirst({
    where: eq(schema.users.email, profile.email),
  });

  let userId: string;
  if (byEmail) {
    userId = byEmail.id;
  } else {
    userId = nanoid(16);
    await db.insert(schema.users).values({
      id: userId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      plan: "free",
    });
  }

  await db.insert(schema.oauthAccounts).values({
    provider,
    providerAccountId: profile.providerAccountId,
    userId,
    accessToken: encrypted,
  });

  return userId;
}
