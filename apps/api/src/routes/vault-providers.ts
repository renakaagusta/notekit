/**
 * Vault provider-specific routes: GitLab PAT connect/disconnect,
 * GitHub App install/repos/create, and Forgejo provision/repos.
 * Side-effect module: registers routes on the shared vaultRoutes instance.
 */
import { and, eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "../adapters/driven/auth/tokenCrypto";
import { db, schema } from "../adapters/driven/db";
import * as fj from "../adapters/driven/git/forgejo";
import { GhError } from "../adapters/driven/git/github";
import * as ghApp from "../adapters/driven/git/github-app";
import * as gl from "../adapters/driven/git/gitlab";
import { provisionForgejoAccount, getForgejoAccount } from "../adapters/driven/vault/forgejoAccounts";
import { getVaultToken } from "../adapters/driven/vault/tokens";
import { vaultRoutes } from "../adapters/driving/routes/vault-router";
import { tryConsume } from "../composition/rate-limit";
import { getCurrentUser } from "../composition/sessions";
import { parseBody, z, RepoName } from "../validation";
import { env, ghErr, isDevToken, vaultMutationLimit } from "./vault-shared";

const provisionCreateLimitBucket = {
  bucket: "vault-provision",
  windowMs: 60 * 60_000,
  max: 10,
};

async function githubInstallationFor(userId: string) {
  return (
    (await db.query.githubAppInstallations.findFirst({
      where: eq(schema.githubAppInstallations.userId, userId),
    })) ?? null
  );
}

const CreateRepoBody = z.object({
  name: RepoName,
  private: z.boolean().optional(),
});

const GitlabConnectBody = z.object({
  token: z.string().min(8).max(200),
});

const GithubAppCreateBody = z.object({
  name: z.string().min(1).max(100),
  private: z.boolean().optional(),
});

// ── GitLab connect endpoints ──────────────────────────────────────────────────

/**
 * GET /vault/gitlab/status — is GitLab connected and as which user?
 */
vaultRoutes.get("/gitlab/status", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const token = await getVaultToken(user.id, "gitlab");
  if (!token) return c.json({ connected: false, login: null });
  if (!env.isProd && isDevToken(token)) return c.json({ connected: true, login: "dev-gitlab" });
  try {
    const login = await gl.getUserLogin(token);
    return c.json({ connected: true, login });
  } catch (err) {
    if (err instanceof GhError && (err.status === 401 || err.status === 403)) {
      return c.json({ connected: false, login: null, reason: "token_invalid" });
    }
    return ghErr(c, err);
  }
});

/**
 * POST /vault/gitlab/connect { token } — validate and store a GitLab PAT.
 */
vaultRoutes.post("/gitlab/connect", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, GitlabConnectBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const info = await gl.getCurrentUserInfo(parsed.data.token);
    const encrypted = encryptToken(parsed.data.token);
    const existing = await db.query.oauthAccounts.findFirst({
      where: and(
        eq(schema.oauthAccounts.provider, "gitlab"),
        eq(schema.oauthAccounts.providerAccountId, String(info.id)),
      ),
    });
    if (existing && existing.userId !== user.id) return c.json({ error: "gitlab_already_linked" }, 409);
    if (existing) {
      await db.update(schema.oauthAccounts)
        .set({ accessToken: encrypted })
        .where(and(
          eq(schema.oauthAccounts.provider, "gitlab"),
          eq(schema.oauthAccounts.providerAccountId, String(info.id)),
        ));
    } else {
      await db.insert(schema.oauthAccounts).values({
        provider: "gitlab",
        providerAccountId: String(info.id),
        userId: user.id,
        accessToken: encrypted,
      });
    }
    return c.json({ ok: true, login: info.username });
  } catch (err) {
    if (err instanceof GhError && (err.status === 401 || err.status === 403)) {
      return c.json({ error: "token_invalid" }, 400);
    }
    return ghErr(c, err);
  }
});

/**
 * DELETE /vault/gitlab/connect — disconnect GitLab.
 */
vaultRoutes.delete("/gitlab/connect", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  await db.delete(schema.oauthAccounts)
    .where(and(
      eq(schema.oauthAccounts.provider, "gitlab"),
      eq(schema.oauthAccounts.userId, user.id),
    ));
  return c.json({ ok: true });
});

// ── GitHub App vault backend ──────────────────────────────────────────────────

/** GET /vault/github-app/status */
vaultRoutes.get("/github-app/status", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!ghApp.githubAppConfigured()) return c.json({ configured: false, installed: false });
  const inst = await githubInstallationFor(user.id);
  return c.json({
    configured: true,
    installed: !!inst,
    slug: env.githubApp.slug,
    accountLogin: inst?.accountLogin ?? null,
  });
});

/** GET /vault/github-app/repos */
vaultRoutes.get("/github-app/repos", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const inst = await githubInstallationFor(user.id);
  if (!inst) return c.json({ error: "github_app_not_installed" }, 400);
  try {
    const repos = await ghApp.listInstallationRepos(inst.installationId);
    return c.json({ repos });
  } catch (err) {
    return ghErr(c, err);
  }
});

/** POST /vault/github-app/create */
vaultRoutes.post("/github-app/create", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const inst = await githubInstallationFor(user.id);
  if (!inst) return c.json({ error: "github_app_not_installed" }, 400);
  if (!inst.userToken) return c.json({ error: "github_app_reauth_required" }, 400);
  const parsed = await parseBody(c, GithubAppCreateBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const userToken = decryptToken(inst.userToken);
    const repo = await ghApp.createUserRepo(userToken, parsed.data.name, parsed.data.private ?? true);
    try {
      await ghApp.addRepoToInstallation(userToken, inst.installationId, repo.id);
    } catch {
      /* all-repos install or manual grant */
    }
    return c.json({ repo });
  } catch (err) {
    return ghErr(c, err);
  }
});

// ── NoteKit-hosted Git (Forgejo) endpoints ────────────────────────────────────

/** POST /vault/notekit/provision */
vaultRoutes.post("/notekit/provision", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!env.forgejo.adminToken) return c.json({ error: "forgejo_not_configured" }, 503);
  const existing = await getForgejoAccount(user.id);
  if (existing) {
    return c.json({ ok: true, username: existing.username, gitUrl: env.forgejo.url ?? null });
  }
  const limited = await tryConsume(c, provisionCreateLimitBucket);
  if (limited) return limited;
  try {
    const account = await provisionForgejoAccount(user.id, user.email, user.name ?? null);
    return c.json({ ok: true, username: account.username, gitUrl: env.forgejo.url ?? null });
  } catch (_err) {
    return c.json({ error: "provision_failed" }, 502);
  }
});

/** GET /vault/notekit/repos */
vaultRoutes.get("/notekit/repos", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!env.forgejo.adminToken) return c.json({ error: "forgejo_not_configured" }, 503);
  const token = await getVaultToken(user.id, "notekit");
  if (!token) return c.json({ error: "not_provisioned" }, 400);
  try {
    const repos = await fj.listRepos(token);
    return c.json({
      repos: repos.map((r) => ({
        id: r.id, name: r.name, fullName: r.full_name, owner: r.owner.login,
        private: r.private, defaultBranch: r.default_branch, description: r.description,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return ghErr(c, err);
  }
});

/** POST /vault/notekit/repos */
vaultRoutes.post("/notekit/repos", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!env.forgejo.adminToken) return c.json({ error: "forgejo_not_configured" }, 503);
  const token = await getVaultToken(user.id, "notekit");
  if (!token) return c.json({ error: "not_provisioned" }, 400);
  const parsed = await parseBody(c, CreateRepoBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const repo = await fj.createRepo(token, parsed.data.name, parsed.data.private ?? true);
    return c.json({ repo: { owner: repo.owner.login, name: repo.name, defaultBranch: repo.default_branch } });
  } catch (err) {
    return ghErr(c, err);
  }
});
