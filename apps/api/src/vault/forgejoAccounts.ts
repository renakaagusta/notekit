/**
 * Manages the lifecycle of per-user Forgejo accounts.
 *
 * When a user (typically a Google-login user with no GitHub account) wants a
 * NoteKit-hosted vault, we auto-provision a Forgejo user for them. The
 * generated personal access token is stored encrypted in `forgejo_accounts`.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../adapters/driven/db";
import { createUser, upsertAccessToken } from "../adapters/driven/git/forgejo";
import { encryptToken, decryptToken } from "../auth/tokenCrypto";

/** Derive a safe Forgejo username from a user's email address. */
function usernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  // Remove everything after + (address tags), replace non-alphanumeric with -, collapse runs.
  const slug = local
    .replace(/\+.*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return slug || "user";
}

function randomPassword(): string {
  return randomBytes(24).toString("base64url");
}

export interface ForgejoAccount {
  username: string;
  token: string;
}

export async function getForgejoAccount(userId: string): Promise<ForgejoAccount | null> {
  const row = await db.query.forgejoAccounts.findFirst({
    where: eq(schema.forgejoAccounts.userId, userId),
  });
  if (!row) return null;
  try {
    return { username: row.username, token: decryptToken(row.accessToken) };
  } catch {
    return null;
  }
}

/**
 * Ensure the user has a Forgejo account. Always re-provisions the access
 * token so the record self-heals when Forgejo state diverges from the DB
 * (e.g. after a Forgejo restart that lost user data).
 */
export async function provisionForgejoAccount(
  userId: string,
  email: string,
  _displayName: string | null,
): Promise<ForgejoAccount> {
  const existing = await getForgejoAccount(userId);
  const username = existing?.username ?? usernameFromEmail(email);
  const password = randomPassword();

  // createUser is idempotent — silently succeeds if the login already exists.
  await createUser(username, email, password);

  // upsertAccessToken deletes any existing token first, then creates fresh.
  // This keeps the DB token in sync with Forgejo even after a Forgejo reset.
  const token = await upsertAccessToken(username, "notekit-api");
  const encryptedToken = encryptToken(token);

  await db
    .insert(schema.forgejoAccounts)
    .values({ userId, username, accessToken: encryptedToken })
    .onConflictDoUpdate({
      target: schema.forgejoAccounts.userId,
      set: { accessToken: encryptedToken },
    });

  return { username, token };
}

export async function getForgejoToken(userId: string): Promise<string | null> {
  const account = await getForgejoAccount(userId);
  return account?.token ?? null;
}
