/**
 * Vault access token resolution.
 *
 * NoteKit supports three vault backends — user-owned GitHub repos, user-owned
 * GitLab projects, and the NoteKit-hosted Forgejo instance. Their access
 * tokens live in different rows (oauth_accounts for the BYO providers,
 * forgejo_accounts for the managed one) but every route that talks to a
 * vault should be provider-agnostic. This module is the one place that knows
 * which lookup path each provider needs.
 *
 * Callers should prefer `getActiveVaultToken(userId)` (returns the vault +
 * its token in one call) over composing `getActiveVault` + `getVaultToken`
 * themselves — that's what most routes need, and it avoids a second DB hit.
 */

import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decryptToken } from "../auth/tokenCrypto";
import { getForgejoToken } from "./forgejoAccounts";
import { getActiveVault } from "./store";
import type { VaultRow } from "./store";

export type GitProvider = "github" | "gitlab" | "notekit";

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

export async function getGitlabToken(userId: string): Promise<string | null> {
  const row = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(schema.oauthAccounts.provider, "gitlab"),
      eq(schema.oauthAccounts.userId, userId),
    ),
  });
  if (!row?.accessToken) return null;
  try {
    return decryptToken(row.accessToken);
  } catch (err) {
    console.error("[tokens] failed to decrypt gitlab token for user", userId, err);
    return null;
  }
}

/**
 * Return the user's stored token for the given provider, or null if they
 * haven't connected that backend yet.
 */
export async function getVaultToken(
  userId: string,
  provider: GitProvider,
): Promise<string | null> {
  if (provider === "notekit") return getForgejoToken(userId);
  if (provider === "gitlab") return getGitlabToken(userId);
  return getGithubToken(userId);
}

/**
 * Resolve the user's active vault and its access token in one call. Returns
 * `{ vault: null, token: null }` when no vault is configured, and
 * `{ vault, token: null }` when a vault exists but its token is missing
 * (user revoked it on GitHub/GitLab, Forgejo account got nuked, etc.) —
 * callers should distinguish those two cases for clearer error messages.
 */
export async function getActiveVaultToken(
  userId: string,
): Promise<{ vault: VaultRow | null; token: string | null }> {
  const vault = await getActiveVault(userId);
  if (!vault) return { vault: null, token: null };
  const token = await getVaultToken(userId, vault.provider);
  return { vault, token };
}
