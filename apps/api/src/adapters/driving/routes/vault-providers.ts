/**
 * Vault provider-specific routes: GitLab PAT connect/disconnect,
 * GitHub App install/repos/create, and Forgejo provision/repos.
 * Side-effect module: registers routes on the shared vaultRoutes instance.
 */
import { tryConsume } from "../../../composition/rate-limit";
import { getCurrentUser } from "../../../composition/sessions";
import {
  connectGitlab,
  createForgejoRepo,
  createGithubAppRepo,
  disconnectGitlab,
  getForgejoAccount,
  getGithubAppStatus,
  getGitlabLogin,
  getVaultToken,
  githubAppConfigured,
  listForgejoRepos,
  listGithubAppRepos,
  provisionForgejo,
} from "../../../composition/vault-providers";
import { GhError } from "../../../domain/errors";
import { parseBody, z, RepoName } from "../../../validation";
import { vaultRoutes } from "./vault-router";
import { env, ghErr, isDevToken, vaultMutationLimit } from "./vault-shared";

const provisionCreateLimitBucket = {
  bucket: "vault-provision",
  windowMs: 60 * 60_000,
  max: 10,
};

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
    const login = await getGitlabLogin(token);
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
    const result = await connectGitlab(user.id, parsed.data.token);
    if (result.status === "already_linked") return c.json({ error: "gitlab_already_linked" }, 409);
    return c.json({ ok: true, login: result.login });
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
  await disconnectGitlab(user.id);
  return c.json({ ok: true });
});

// ── GitHub App vault backend ──────────────────────────────────────────────────

/** GET /vault/github-app/status */
vaultRoutes.get("/github-app/status", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!githubAppConfigured()) return c.json({ configured: false, installed: false });
  const status = await getGithubAppStatus(user.id);
  return c.json({
    configured: true,
    installed: status.installed,
    slug: env.githubApp.slug,
    accountLogin: status.accountLogin,
  });
});

/** GET /vault/github-app/repos */
vaultRoutes.get("/github-app/repos", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  try {
    const result = await listGithubAppRepos(user.id);
    if (result.status === "not_installed") return c.json({ error: "github_app_not_installed" }, 400);
    return c.json({ repos: result.repos });
  } catch (err) {
    return ghErr(c, err);
  }
});

/** POST /vault/github-app/create */
vaultRoutes.post("/github-app/create", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const status = await getGithubAppStatus(user.id);
  if (!status.installed) return c.json({ error: "github_app_not_installed" }, 400);
  if (!status.hasUserToken) return c.json({ error: "github_app_reauth_required" }, 400);
  const parsed = await parseBody(c, GithubAppCreateBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const result = await createGithubAppRepo(user.id, parsed.data.name, parsed.data.private ?? true);
    if (result.status === "not_installed") return c.json({ error: "github_app_not_installed" }, 400);
    if (result.status === "reauth_required") return c.json({ error: "github_app_reauth_required" }, 400);
    return c.json({ repo: result.repo });
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
    const account = await provisionForgejo(user.id, user.email, user.name ?? null);
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
    const repos = await listForgejoRepos(token);
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
    const repo = await createForgejoRepo(token, parsed.data.name, parsed.data.private ?? true);
    return c.json({ repo: { owner: repo.owner.login, name: repo.name, defaultBranch: repo.default_branch } });
  } catch (err) {
    return ghErr(c, err);
  }
});
