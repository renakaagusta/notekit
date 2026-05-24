/**
 * First-login bootstrap: give every new user a working managed vault so
 * they land in the app with somewhere to write, instead of a "pick a
 * storage backend" wall.
 *
 * Flow:
 *   1. If the user already has any vault row, do nothing.
 *   2. Else, provision their Forgejo account (idempotent).
 *   3. Create a default `notekit-vault` repo on Forgejo if one doesn't exist.
 *   4. Register it in the `vaults` table and set it active.
 *
 * All steps are best-effort. If Forgejo is unconfigured or unreachable the
 * caller (the auth callback) ignores the failure — the user can connect a
 * BYO GitHub/GitLab vault later from settings, or hit the existing manual
 * `/vault/notekit/provision` endpoint to retry.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { provisionForgejoAccount } from "./forgejoAccounts";
import * as fj from "./forgejo";
import { createVault, setActiveVault } from "./store";

const DEFAULT_REPO_NAME = "notekit-vault";
const DEFAULT_VAULT_LABEL = "My vault";

/**
 * Idempotent: safe to call on every sign-in. Returns true if a new default
 * vault was created, false otherwise (already has one, or Forgejo skipped).
 */
export async function ensureDefaultVault(
  userId: string,
  email: string,
): Promise<boolean> {
  if (!env.forgejo.adminToken) return false;

  // If the user already has any vault, leave well enough alone. The point
  // is to fix the "no vault → blank-screen onboarding" gap, not to fight
  // the user over which one they picked.
  const anyVault = await db.query.vaults.findFirst({
    where: eq(schema.vaults.userId, userId),
  });
  if (anyVault) return false;

  try {
    const account = await provisionForgejoAccount(userId, email, null);

    // List repos and reuse if a default already exists (e.g. user provisioned
    // earlier, deleted the vaults row, and we're back here).
    const repos = await fj.listRepos(account.token);
    let repo = repos.find((r) => r.name === DEFAULT_REPO_NAME);
    if (!repo) {
      repo = await fj.createRepo(account.token, DEFAULT_REPO_NAME, true);
    }

    const vault = await createVault({
      userId,
      provider: "notekit",
      owner: repo.owner.login,
      repo: repo.name,
      branch: repo.default_branch || "main",
      label: DEFAULT_VAULT_LABEL,
    });
    await setActiveVault(userId, vault.id);
    return true;
  } catch (err) {
    console.error("[bootstrap] ensureDefaultVault failed for user", userId, err);
    return false;
  }
}
