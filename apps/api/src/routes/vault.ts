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
import {
  createVault,
  deleteVault as removeVault,
  getActiveVault,
  getVaultById,
  getVaultSettings,
  listVaultsForUser,
  renameVault,
  setActiveVault,
  updateVaultSettings,
  type VaultRow,
  type VaultSettingsValue,
} from "../vault/store";
import { pairRoutes } from "./pair";

// Folder prefixes that count as importable NoteKit content.
const IMPORT_PREFIXES = ["notes/", "tickets/", "journal/", "attachments/"];

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

function vaultToRef(v: VaultRow) {
  return {
    id: v.id,
    provider: v.provider,
    owner: v.owner,
    repo: v.repo,
    branch: v.branch,
    label: v.label,
  };
}

/**
 * GET /vault/status — the active vault for this user, if any. The `vault`
 * shape is kept identical to the pre-multi-vault response (owner/repo/branch)
 * so older clients keep working; new clients should prefer GET /vaults.
 */
vaultRoutes.get("/status", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const active = await getActiveVault(user.id);
  const hasToken = Boolean(await getGithubToken(user.id));
  return c.json({
    configured: Boolean(active),
    hasGithubToken: hasToken,
    vault: active
      ? {
          id: active.id,
          owner: active.owner,
          repo: active.repo,
          branch: active.branch,
          provider: active.provider,
          label: active.label,
        }
      : null,
  });
});

/**
 * GET /vaults — list every vault the user has registered.
 */
vaultRoutes.get("/vaults", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const vaults = await listVaultsForUser(user.id);
  const active = await getActiveVault(user.id);
  return c.json({
    activeId: active?.id ?? null,
    vaults: vaults.map(vaultToRef),
  });
});

/**
 * POST /vaults — register a new vault (an existing repo the user owns) and
 * set it as active. Body: { provider, owner, repo, branch?, label? }.
 * `provider` is restricted to "github" at runtime; "notekit" is reserved
 * for future Forgejo support and returns 400 today.
 */
vaultRoutes.post("/vaults", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    provider?: string;
    owner?: string;
    repo?: string;
    branch?: string;
    label?: string;
  } | null;
  if (!body?.owner || !body?.repo) {
    return c.json({ error: "owner_and_repo_required" }, 400);
  }
  const provider = (body.provider ?? "github") as "github" | "notekit";
  if (provider === "notekit") {
    return c.json(
      { error: "provider_not_supported", message: "NoteKit Git (Forgejo) is not wired yet." },
      400,
    );
  }
  if (provider !== "github") {
    return c.json({ error: "provider_invalid" }, 400);
  }
  const vault = await createVault({
    userId: user.id,
    provider,
    owner: body.owner,
    repo: body.repo,
    branch: body.branch ?? "main",
    label: body.label,
  });
  await setActiveVault(user.id, vault.id);
  return c.json({ vault: vaultToRef(vault), activeId: vault.id });
});

/**
 * POST /vaults/:id/select — make this vault the active one.
 */
vaultRoutes.post("/vaults/:id/select", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const vault = await setActiveVault(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  return c.json({ activeId: vault.id, vault: vaultToRef(vault) });
});

/**
 * PATCH /vaults/:id — rename or change the tracked branch. Provider/owner/repo
 * are immutable — to switch repos, register a new vault and delete the old one.
 */
vaultRoutes.patch("/vaults/:id", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as {
    label?: string | null;
    branch?: string;
  } | null;
  if (!body || (body.label === undefined && body.branch === undefined)) {
    return c.json({ error: "no_fields_to_update" }, 400);
  }
  const patch: { label?: string | null; branch?: string } = {};
  if (body.label !== undefined) patch.label = body.label;
  if (body.branch !== undefined) patch.branch = body.branch;
  const updated = await renameVault(user.id, id, patch);
  if (!updated) return c.json({ error: "vault_not_found" }, 404);
  return c.json({ vault: vaultToRef(updated) });
});

/**
 * DELETE /vaults/:id — unregister the vault from NoteKit. Does NOT delete the
 * underlying GitHub repo. If the deleted vault was active, the next oldest
 * vault (if any) becomes active.
 */
vaultRoutes.delete("/vaults/:id", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const result = await removeVault(user.id, id);
  if (!result.deleted) return c.json({ error: "vault_not_found" }, 404);
  return c.json({ ok: true, activeId: result.newActiveId });
});

/**
 * GET /vaults/:id/settings — per-vault preferences.
 */
vaultRoutes.get("/vaults/:id/settings", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  const settings = await getVaultSettings(id);
  return c.json({ settings });
});

/**
 * PATCH /vaults/:id/settings — partial update of per-vault preferences.
 */
vaultRoutes.patch("/vaults/:id/settings", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  const body = (await c.req.json().catch(() => null)) as Partial<VaultSettingsValue> | null;
  if (!body) return c.json({ error: "body_required" }, 400);
  if (body.theme !== undefined && !["auto", "light", "dark"].includes(body.theme)) {
    return c.json({ error: "invalid_theme" }, 400);
  }
  const settings = await updateVaultSettings(id, body);
  return c.json({ settings });
});

/**
 * POST /vaults/:destId/import — copy notes/tickets/journals/attachments from
 * another registered vault into this one. Body: { sourceId: string }.
 * Conflict policy: any path already present in the destination is skipped
 * (never overwritten). Operates entirely server-side against GitHub; the
 * client just polls the response.
 */
vaultRoutes.post("/vaults/:destId/import", async (c) => {
  const { userId, token } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const destId = c.req.param("destId");
  const body = (await c.req.json().catch(() => null)) as {
    sourceId?: string;
  } | null;
  if (!body?.sourceId) return c.json({ error: "source_id_required" }, 400);
  if (body.sourceId === destId) {
    return c.json({ error: "source_and_dest_same" }, 400);
  }

  const [source, dest] = await Promise.all([
    getVaultById(userId, body.sourceId),
    getVaultById(userId, destId),
  ]);
  if (!source) return c.json({ error: "source_vault_not_found" }, 404);
  if (!dest) return c.json({ error: "dest_vault_not_found" }, 404);

  // Dev-mode stub: fake token never hits GitHub; pretend nothing to import.
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ imported: 0, skipped: 0, errors: [] });
  }

  let imported = 0;
  let skipped = 0;
  const errors: { path: string; reason: string }[] = [];

  try {
    // 1. Build dest-path set so we can skip duplicates without re-hitting GH.
    const destPaths = new Set<string>();
    for (const prefix of IMPORT_PREFIXES) {
      const entries = await listTree(
        token,
        dest.owner,
        dest.repo,
        dest.branch,
        prefix,
      );
      for (const e of entries) destPaths.add(e.path);
    }

    // 2. Enumerate source files; copy each one missing in dest.
    for (const prefix of IMPORT_PREFIXES) {
      const entries = await listTree(
        token,
        source.owner,
        source.repo,
        source.branch,
        prefix,
      );
      for (const entry of entries) {
        if (destPaths.has(entry.path)) {
          skipped++;
          continue;
        }
        try {
          const file = await readFile(
            token,
            source.owner,
            source.repo,
            entry.path,
            source.branch,
          );
          if (!file) {
            skipped++;
            continue;
          }
          await writeFile(
            token,
            dest.owner,
            dest.repo,
            entry.path,
            file.content,
            `notekit: import ${entry.path} from ${source.owner}/${source.repo}`,
            dest.branch,
          );
          imported++;
        } catch (e) {
          errors.push({
            path: entry.path,
            reason: e instanceof GhError ? `gh:${e.status}` : (e as Error).message,
          });
        }
      }
    }
    return c.json({ imported, skipped, errors });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * GET /vault/repos — list user's GitHub repos for the picker.
 */
vaultRoutes.get("/repos", async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  // Dev-mode stub: fake token never hits GitHub; return a fixture so the UI works.
  if (!env.isProd && token === "dev_github_token") {
    return c.json({
      repos: [
        {
          id: 1,
          name: "vault-primary",
          fullName: "dev/vault-primary",
          owner: "dev",
          private: true,
          defaultBranch: "main",
          description: "Dev primary vault",
          updatedAt: new Date().toISOString(),
        },
        {
          id: 2,
          name: "vault-archive",
          fullName: "dev/vault-archive",
          owner: "dev",
          private: true,
          defaultBranch: "main",
          description: "Dev archive vault",
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  }
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
 * POST /vault/select — legacy single-vault entry point. Registers the repo
 * as a vault if not already, and sets it active. Kept so older clients keep
 * working; new clients should use POST /vaults + POST /vaults/:id/select.
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
  const vault = await createVault({
    userId: user.id,
    provider: "github",
    owner: body.owner,
    repo: body.repo,
    branch,
  });
  await setActiveVault(user.id, vault.id);
  return c.json({
    ok: true,
    vault: {
      id: vault.id,
      owner: vault.owner,
      repo: vault.repo,
      branch: vault.branch,
    },
  });
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
  const active = await getActiveVault(userId);
  if (!active) return null;
  return {
    owner: active.owner,
    repo: active.repo,
    branch: active.branch,
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
  // Dev-mode stub: fake token never hits GitHub; return an empty commit list.
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ commits: [] });
  }
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
  // Dev-mode stub: fake token never hits GitHub; pretend the prefix is empty.
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ entries: [] });
  }
  try {
    const entries = await listTree(token, vault.owner, vault.repo, vault.branch, prefix);
    return c.json({
      entries: entries.map((e) => ({ path: e.path, sha: e.sha })),
    });
  } catch (err) {
    return ghErr(c, err);
  }
});
