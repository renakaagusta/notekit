import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { getCurrentUser } from "../auth/sessions";
import { getActingAgent } from "../auth/agentAuth";
import { getGithubToken } from "../vault/tokens";
import {
  listRepos,
  createRepo,
  readFile,
  writeFile,
  writeFileAs,
  deleteFile,
  listTree,
  listCommits,
  getUserLogin,
  GhError,
  type GitAuthor,
} from "../vault/github";
import { readAgent, defaultEmailFor } from "../vault/agents";
import { pairRoutes } from "./pair";

export const vaultRoutes = new Hono();

vaultRoutes.route("/pair", pairRoutes);

async function requireUserAndToken(c: Context) {
  const user = await getCurrentUser(c);
  if (!user) return { user: null, token: null };
  const token = await getGithubToken(user.id);
  return { user, token };
}

/**
 * Resolve the acting principal: either a session user, or an agent acting
 * on behalf of the user that created it. Returns the underlying user (so
 * we know which GitHub token to use) plus the optional acting agent slug.
 */
async function requirePrincipal(c: Context): Promise<{
  userId: string | null;
  token: string | null;
  actingAs: string | null;
}> {
  const agent = await getActingAgent(c);
  if (agent) {
    const token = await getGithubToken(agent.userId);
    return { userId: agent.userId, token, actingAs: agent.agentSlug };
  }
  const user = await getCurrentUser(c);
  if (!user) return { userId: null, token: null, actingAs: null };
  const token = await getGithubToken(user.id);
  return { userId: user.id, token, actingAs: null };
}

function ghErr(c: Context, err: unknown) {
  if (err instanceof GhError) {
    return c.json(
      { error: "github_error", status: err.status, message: err.message },
      502,
    );
  }
  console.error("[vault] unexpected error:", err);
  return c.json({ error: "server_error" }, 500);
}

/**
 * GET /vault/status — what vault is configured for this user, if any.
 */
vaultRoutes.get("/status", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const settings = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, user.id),
  });
  const hasToken = Boolean(await getGithubToken(user.id));
  return c.json({
    configured: Boolean(settings?.vaultOwner && settings?.vaultRepo),
    hasGithubToken: hasToken,
    vault: settings
      ? {
          owner: settings.vaultOwner,
          repo: settings.vaultRepo,
          branch: settings.vaultBranch ?? "main",
        }
      : null,
  });
});

/**
 * GET /vault/repos — list user's GitHub repos for the picker.
 */
vaultRoutes.get("/repos", async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  try {
    const repos = await listRepos(token);
    return c.json({
      repos: repos.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        owner: r.owner.login,
        private: r.private,
        defaultBranch: r.default_branch,
        description: r.description,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * POST /vault/repos — create a new repo to act as the vault.
 * body: { name: string, private?: boolean }
 */
vaultRoutes.post("/repos", async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    private?: boolean;
  } | null;
  if (!body?.name) return c.json({ error: "name_required" }, 400);
  try {
    const repo = await createRepo(token, body.name, body.private ?? true);
    return c.json({
      repo: {
        owner: repo.owner.login,
        name: repo.name,
        defaultBranch: repo.default_branch,
      },
    });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * POST /vault/select — set the active vault repo for this user.
 * body: { owner: string, repo: string, branch?: string }
 */
vaultRoutes.post("/select", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    owner?: string;
    repo?: string;
    branch?: string;
  } | null;
  if (!body?.owner || !body?.repo) {
    return c.json({ error: "owner_and_repo_required" }, 400);
  }
  const branch = body.branch ?? "main";
  const now = new Date();

  const existing = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, user.id),
  });
  if (existing) {
    await db
      .update(schema.userSettings)
      .set({
        vaultProvider: "github",
        vaultOwner: body.owner,
        vaultRepo: body.repo,
        vaultBranch: branch,
        updatedAt: now,
      })
      .where(eq(schema.userSettings.userId, user.id));
  } else {
    await db.insert(schema.userSettings).values({
      userId: user.id,
      vaultProvider: "github",
      vaultOwner: body.owner,
      vaultRepo: body.repo,
      vaultBranch: branch,
      updatedAt: now,
    });
  }
  return c.json({ ok: true, vault: { owner: body.owner, repo: body.repo, branch } });
});

/**
 * GET /vault/whoami — convenience: GH login from current token.
 */
vaultRoutes.get("/whoami", async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  try {
    const login = await getUserLogin(token);
    return c.json({ login });
  } catch (err) {
    return ghErr(c, err);
  }
});

async function resolveVault(userId: string) {
  const settings = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, userId),
  });
  if (!settings?.vaultOwner || !settings?.vaultRepo) return null;
  return {
    owner: settings.vaultOwner,
    repo: settings.vaultRepo,
    branch: settings.vaultBranch ?? "main",
  };
}

/**
 * GET /vault/file?path=... — read a single file. Returns { path, sha, content } or { content: null }.
 */
vaultRoutes.get("/file", async (c) => {
  const { userId, token } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path_required" }, 400);
  // Dev-mode stub: fake token never hits GitHub; all files return empty.
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ path, content: null, sha: null });
  }
  try {
    const file = await readFile(token, vault.owner, vault.repo, path, vault.branch);
    if (!file) return c.json({ path, content: null, sha: null });
    return c.json(file);
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * PUT /vault/file — create or update a file.
 * body: { path, content, message?, sha? }
 *
 * If the caller is an agent (bearer token), the commit is authored as the
 * agent (Git Data API), with the user as committer.
 */
vaultRoutes.put("/file", async (c) => {
  const { userId, token, actingAs } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const body = (await c.req.json().catch(() => null)) as {
    path?: string;
    content?: string;
    message?: string;
    sha?: string;
  } | null;
  if (!body?.path || typeof body.content !== "string") {
    return c.json({ error: "path_and_content_required" }, 400);
  }
  // Dev-mode stub: fake token never hits GitHub; pretend the write succeeded.
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ path: body.path, sha: "dev_sha_000", content: body.content });
  }
  try {
    if (actingAs) {
      const found = await readAgent(token, vault.owner, vault.repo, vault.branch, actingAs);
      if (!found) return c.json({ error: "agent_profile_missing", slug: actingAs }, 409);
      const author: GitAuthor = {
        name: found.profile.name,
        email: found.profile.email || defaultEmailFor(actingAs),
      };
      const login = await getUserLogin(token);
      const committer: GitAuthor = {
        name: login,
        email: `${login}@users.noreply.github.com`,
      };
      const result = await writeFileAs(
        token,
        vault.owner,
        vault.repo,
        body.path,
        body.content,
        body.message ?? `notekit: ${actingAs} updated ${body.path}`,
        vault.branch,
        author,
        committer,
      );
      return c.json({ path: body.path, sha: result.sha, actor: `agent:${actingAs}` });
    }
    const result = await writeFile(
      token,
      vault.owner,
      vault.repo,
      body.path,
      body.content,
      body.message ?? `notekit: update ${body.path}`,
      vault.branch,
      body.sha,
    );
    return c.json({ path: body.path, sha: result.sha, actor: "user" });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * DELETE /vault/file — delete a file. body: { path, sha, message? }
 */
vaultRoutes.delete("/file", async (c) => {
  const { userId, token } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const body = (await c.req.json().catch(() => null)) as {
    path?: string;
    sha?: string;
    message?: string;
  } | null;
  if (!body?.path || !body?.sha) {
    return c.json({ error: "path_and_sha_required" }, 400);
  }
  try {
    await deleteFile(
      token,
      vault.owner,
      vault.repo,
      body.path,
      body.message ?? `notekit: delete ${body.path}`,
      vault.branch,
      body.sha,
    );
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * GET /vault/commits?path=...&limit=50 — list recent commits, optionally scoped to a path.
 */
vaultRoutes.get("/commits", async (c) => {
  const { userId, token } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const path = c.req.query("path") || undefined;
  const limit = Number(c.req.query("limit") ?? "50") || 50;
  try {
    const commits = await listCommits(
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      path,
      limit,
    );
    return c.json({ commits });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * GET /vault/list?prefix=notes/ — list all blobs under a prefix.
 */
vaultRoutes.get("/list", async (c) => {
  const { userId, token } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const prefix = c.req.query("prefix") ?? "";
  try {
    const entries = await listTree(token, vault.owner, vault.repo, vault.branch, prefix);
    return c.json({
      entries: entries.map((e) => ({ path: e.path, sha: e.sha })),
    });
  } catch (err) {
    return ghErr(c, err);
  }
});
