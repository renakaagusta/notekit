import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decryptToken } from "../auth/tokenCrypto";

export async function getGithubToken(userId: string): Promise<string | null> {
  const row = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(schema.oauthAccounts.provider, "github"),
      eq(schema.oauthAccounts.userId, userId),
    ),
  });
  if (!row?.accessToken) return null;
  try {
    return decryptToken(row.accessToken);
  } catch (err) {
    console.error("[tokens] failed to decrypt github token for user", userId, err);
    return null;
  }
}
