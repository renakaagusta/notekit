import { Hono, type Context } from "hono";
import { env } from "../env";
import { getCurrentUser } from "../auth/sessions";
import { getActingAgent } from "../auth/agentAuth";
import { getGithubToken } from "../vault/tokens";
import { getForgejoToken, provisionForgejoAccount } from "../vault/forgejoAccounts";
import {
  parseBody,
  z,
  FolderPathNullable,
  AgentSlugNullable,
  BranchName,
  OwnerName,
  RepoName,
  Label,
  LabelNullable,
  ThemeEnum,
  VaultProviderEnum,
  GithubUsername,
  CollaboratorPermissionEnum,
} from "../validation";
import { rateLimit } from "../middleware/rateLimit";
import * as gh from "../vault/github";
import * as fj from "../vault/forgejo";
import {
  listRepos,
  createRepo,
  getUserLogin,
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  listInvitations,
  cancelInvitation,
  GhError,
  type GitAuthor,
} from "../vault/github";
import { readAgent, defaultEmailFor } from "../vault/agents";
import { emitAgentEvent } from "../notifications/emit";
import { isPlus } from "../iap/entitlement";

type GitProvider = "github" | "notekit";

function gitOps(provider: GitProvider) {
  return provider === "notekit" ? fj : gh;
}

const MOBILE_FREE_NOTE_CAP = 50;
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
} from "../vault/store";
import { pairRoutes } from "./pair";

// Folder prefixes that count as importable NoteKit content.
const IMPORT_PREFIXES = ["notes/", "tickets/", "journal/", "attachments/"];

// Per-principal limits. Generous defaults — these are tuned for legitimate
// interactive use; abuse trips them long before the user does.
const vaultMutationLimit = rateLimit({
  bucket: "vault-mutation",
  windowMs: 60_000,
  max: 30,
});
const writeLimit = rateLimit({
  bucket: "vault-write",
  windowMs: 60_000,
  max: 120,
});
const importLimit = rateLimit({
  bucket: "vault-import",
  windowMs: 60 * 60_000, // 1 hour
  max: 5,
});

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
    console.error("[vault] github error:", err.status, err.message);
    let message = `GitHub error ${err.status}`;
    try {
      const parsed = JSON.parse(err.body) as {
        message?: string;
        errors?: { message?: string }[];
      };
      const inner = parsed.errors?.[0]?.message;
      message = inner ?? parsed.message ?? message;
    } catch {}
    // Pass 4xx back to the client so the UI can show the actual message.
    // Wrap 5xx as 502 since GitHub being down is our problem, not the client's.
    const status = err.status >= 400 && err.status < 500 ? err.status : 502;
    return c.json(
      { error: "github_error", status: err.status, message },
      status as 400 | 422 | 404 | 403 | 401 | 502,
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

const CreateVaultBody = z.object({
  provider: VaultProviderEnum.optional().default("github"),
  owner: OwnerName,
  repo: RepoName,
  branch: BranchName.optional().default("main"),
  label: Label.optional(),
});

/**
 * POST /vaults — register a new vault (an existing repo the user owns) and
 * set it as active. `provider` is restricted to "github" at runtime;
 * "notekit" is reserved for future Forgejo support and returns 400 today.
 */
vaultRoutes.post("/vaults", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, CreateVaultBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const vault = await createVault({
    userId: user.id,
    provider: parsed.data.provider,
    owner: parsed.data.owner,
    repo: parsed.data.repo,
    branch: parsed.data.branch,
    label: parsed.data.label,
  });
  await setActiveVault(user.id, vault.id);
  return c.json({ vault: vaultToRef(vault), activeId: vault.id });
});

/**
 * POST /vaults/:id/select — make this vault the active one.
 */
vaultRoutes.post("/vaults/:id/select", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const vault = await setActiveVault(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  return c.json({ activeId: vault.id, vault: vaultToRef(vault) });
});

const PatchVaultBody = z
  .object({
    label: LabelNullable.optional(),
    branch: BranchName.optional(),
  })
  .refine(
    (b) => b.label !== undefined || b.branch !== undefined,
    { message: "no_fields_to_update" },
  );

/**
 * PATCH /vaults/:id — rename or change the tracked branch. Provider/owner/repo
 * are immutable — to switch repos, register a new vault and delete the old one.
 */
vaultRoutes.patch("/vaults/:id", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const parsed = await parseBody(c, PatchVaultBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const updated = await renameVault(user.id, id, parsed.data);
  if (!updated) return c.json({ error: "vault_not_found" }, 404);
  return c.json({ vault: vaultToRef(updated) });
});

/**
 * DELETE /vaults/:id — unregister the vault from NoteKit. Does NOT delete the
 * underlying GitHub repo. If the deleted vault was active, the next oldest
 * vault (if any) becomes active.
 */
vaultRoutes.delete("/vaults/:id", vaultMutationLimit, async (c) => {
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

const PatchVaultSettingsBody = z.object({
  theme: ThemeEnum.optional(),
  defaultFolder: FolderPathNullable.optional(),
  defaultAgentSlug: AgentSlugNullable.optional(),
});

/**
 * PATCH /vaults/:id/settings — partial update of per-vault preferences.
 */
vaultRoutes.patch("/vaults/:id/settings", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  const parsed = await parseBody(c, PatchVaultSettingsBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const settings = await updateVaultSettings(id, parsed.data);
  return c.json({ settings });
});

/**
 * POST /vaults/:destId/import — copy notes/tickets/journals/attachments from
 * another registered vault into this one. Body: { sourceId: string }.
 * Conflict policy: any path already present in the destination is skipped
 * (never overwritten). Operates entirely server-side against GitHub; the
 * client just polls the response.
 */
const ImportBody = z.object({
  sourceId: z.string().min(1).max(64),
});

// Cap how many source files we'll process in one import. Each file is one
// list + read + write to GitHub — hundreds is fine, thousands risks both
// secondary rate limits and a request that the client times out on.
const IMPORT_FILE_CAP = 500;

// Single-flight per user: only one import may be in progress at a time.
// Map user id → AbortController-ish marker. Cleared on completion or error.
const inFlightImports = new Set<string>();

vaultRoutes.post("/vaults/:destId/import", importLimit, async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const destId = c.req.param("destId");
  const parsed = await parseBody(c, ImportBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  if (parsed.data.sourceId === destId) {
    return c.json({ error: "source_and_dest_same" }, 400);
  }

  const [source, dest] = await Promise.all([
    getVaultById(userId, parsed.data.sourceId),
    getVaultById(userId, destId),
  ]);
  if (!source) return c.json({ error: "source_vault_not_found" }, 404);
  if (!dest) return c.json({ error: "dest_vault_not_found" }, 404);

  const srcProvider = source.provider as GitProvider;
  const dstProvider = dest.provider as GitProvider;
  const [srcToken, dstToken] = await Promise.all([
    getVaultToken(userId, srcProvider),
    getVaultToken(userId, dstProvider),
  ]);
  if (!srcToken || !dstToken) return c.json({ error: "no_git_token" }, 400);

  if (inFlightImports.has(userId)) {
    return c.json({ error: "import_already_running" }, 429);
  }
  inFlightImports.add(userId);

  if (!env.isProd && srcToken === "dev_github_token") {
    inFlightImports.delete(userId);
    return c.json({ imported: 0, skipped: 0, errors: [] });
  }

  let imported = 0;
  let skipped = 0;
  const errors: { path: string; reason: string }[] = [];

  try {
    // 1. Build dest-path set so we can skip duplicates without re-hitting the provider.
    const destPaths = new Set<string>();
    for (const prefix of IMPORT_PREFIXES) {
      const entries = await gitOps(dstProvider).listTree(
        dstToken,
        dest.owner,
        dest.repo,
        dest.branch,
        prefix,
      );
      for (const e of entries) destPaths.add(e.path);
    }

    // 2. Plan: enumerate all source files first so we can refuse over-cap
    // imports cleanly rather than partially writing.
    const plan: { path: string }[] = [];
    for (const prefix of IMPORT_PREFIXES) {
      const entries = await gitOps(srcProvider).listTree(
        srcToken,
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
        plan.push({ path: entry.path });
      }
    }

    if (plan.length > IMPORT_FILE_CAP) {
      return c.json(
        {
          error: "import_too_large",
          message: `Import is capped at ${IMPORT_FILE_CAP} files; source has ${plan.length} new files to copy.`,
          cap: IMPORT_FILE_CAP,
          would_import: plan.length,
        },
        413,
      );
    }

    // 3. Copy each planned file. Per-file errors are recorded; the whole
    // operation still returns a 200 with the partial result.
    for (const item of plan) {
      try {
        const file = await gitOps(srcProvider).readFile(
          srcToken,
          source.owner,
          source.repo,
          item.path,
          source.branch,
        );
        if (!file) {
          skipped++;
          continue;
        }
        await gitOps(dstProvider).writeFile(
          dstToken,
          dest.owner,
          dest.repo,
          item.path,
          file.content,
          `notekit: import ${item.path} from ${source.owner}/${source.repo}`,
          dest.branch,
        );
        imported++;
      } catch (e) {
        errors.push({
          path: item.path,
          reason: e instanceof GhError ? `gh:${e.status}` : (e as Error).message,
        });
      }
    }
    return c.json({ imported, skipped, errors });
  } catch (err) {
    return ghErr(c, err);
  } finally {
    inFlightImports.delete(userId);
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

const CreateRepoBody = z.object({
  name: RepoName,
  private: z.boolean().optional(),
});

/**
 * POST /vault/repos — create a new repo to act as the vault.
 */
vaultRoutes.post("/repos", vaultMutationLimit, async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const parsed = await parseBody(c, CreateRepoBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const repo = await createRepo(token, parsed.data.name, parsed.data.private ?? true);
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

const LegacySelectBody = z.object({
  owner: OwnerName,
  repo: RepoName,
  branch: BranchName.optional().default("main"),
});

/**
 * POST /vault/select — legacy single-vault entry point. Registers the repo
 * as a vault if not already, and sets it active. Kept so older clients keep
 * working; new clients should use POST /vaults + POST /vaults/:id/select.
 *
 * Emits `Deprecation` per RFC 8594 so clients can surface a warning.
 */
vaultRoutes.post("/select", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, LegacySelectBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const vault = await createVault({
    userId: user.id,
    provider: "github",
    owner: parsed.data.owner,
    repo: parsed.data.repo,
    branch: parsed.data.branch,
  });
  await setActiveVault(user.id, vault.id);
  c.header("Deprecation", "true");
  c.header("Sunset", "Sat, 16 Aug 2026 00:00:00 GMT");
  c.header("Link", '</vault/vaults>; rel="successor-version"');
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
    provider: active.provider as GitProvider,
  };
}

async function getVaultToken(userId: string, provider: GitProvider): Promise<string | null> {
  return provider === "notekit" ? getForgejoToken(userId) : getGithubToken(userId);
}

/**
 * GET /vault/file?path=...&ref=<sha|branch> — read a single file, optionally
 * at a specific commit SHA. Omit `ref` to read the branch HEAD.
 */
vaultRoutes.get("/file", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const path = c.req.query("path");
  if (!path) return c.json({ error: "path_required" }, 400);
  const ref = c.req.query("ref") ?? vault.branch;
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ path, content: null, sha: null });
  }
  try {
    const file = await gitOps(vault.provider).readFile(token, vault.owner, vault.repo, path, ref);
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
vaultRoutes.put("/file", writeLimit, async (c) => {
  const { userId, actingAs } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const body = (await c.req.json().catch(() => null)) as {
    path?: string;
    content?: string;
    message?: string;
    sha?: string;
  } | null;
  if (!body?.path || typeof body.content !== "string") {
    return c.json({ error: "path_and_content_required" }, 400);
  }

  const clientHeader = c.req.header("x-notekit-client");
  if (
    clientHeader === "mobile" &&
    !actingAs &&
    !body.sha &&
    body.path.startsWith("notes/")
  ) {
    const me = await getCurrentUser(c);
    if (me && !isPlus(me)) {
      if (!env.isProd && token === "dev_github_token") {
        // Dev stub treats count as 0.
      } else {
        const entries = await gitOps(vault.provider).listTree(
          token,
          vault.owner,
          vault.repo,
          vault.branch,
          "notes/",
        );
        if (entries.length >= MOBILE_FREE_NOTE_CAP) {
          return c.json(
            {
              error: "free_mobile_limit",
              cap: MOBILE_FREE_NOTE_CAP,
              count: entries.length,
            },
            403,
          );
        }
      }
    }
  }
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
      const result = await gitOps(vault.provider).writeFileAs(
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
      emitAgentEvent({
        userId,
        agentSlug: actingAs,
        eventType: "file.write",
        resourcePath: body.path,
        extra: { sha: result.sha },
      });
      return c.json({ path: body.path, sha: result.sha, actor: `agent:${actingAs}` });
    }
    const result = await gitOps(vault.provider).writeFile(
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
vaultRoutes.delete("/file", writeLimit, async (c) => {
  const { userId, actingAs } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const body = (await c.req.json().catch(() => null)) as {
    path?: string;
    sha?: string;
    message?: string;
  } | null;
  if (!body?.path || !body?.sha) {
    return c.json({ error: "path_and_sha_required" }, 400);
  }
  try {
    await gitOps(vault.provider).deleteFile(
      token,
      vault.owner,
      vault.repo,
      body.path,
      body.message ?? `notekit: delete ${body.path}`,
      vault.branch,
      body.sha,
    );
    if (actingAs) {
      emitAgentEvent({
        userId,
        agentSlug: actingAs,
        eventType: "file.delete",
        resourcePath: body.path,
      });
    }
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * GET /vault/commits?path=...&limit=50 — list recent commits, optionally scoped to a path.
 */
vaultRoutes.get("/commits", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const path = c.req.query("path") || undefined;
  const limit = Number(c.req.query("limit") ?? "50") || 50;
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ commits: [] });
  }
  try {
    const commits = await gitOps(vault.provider).listCommits(
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
 * GET /vaults/:id/members — list collaborators + pending invitations.
 */
vaultRoutes.get("/vaults/:id/members", async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const id = c.req.param("id");
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ members: [], invitations: [] });
  }
  try {
    const [members, invitations] = await Promise.all([
      listCollaborators(token, vault.owner, vault.repo),
      listInvitations(token, vault.owner, vault.repo),
    ]);
    return c.json({ members, invitations });
  } catch (err) {
    return ghErr(c, err);
  }
});

const AddMemberBody = z.object({
  permission: CollaboratorPermissionEnum.optional().default("push"),
});

/**
 * PUT /vaults/:id/members/:username — add or update a collaborator.
 * Returns { status: "invited" | "added" } depending on whether the user
 * already had access. GitHub sends them an email invitation.
 */
vaultRoutes.put("/vaults/:id/members/:username", vaultMutationLimit, async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const id = c.req.param("id");
  const username = c.req.param("username");
  const usernameResult = GithubUsername.safeParse(username);
  if (!usernameResult.success) return c.json({ error: "invalid_username" }, 400);
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  const parsed = await parseBody(c, AddMemberBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ status: "invited", invitation: null });
  }
  try {
    const result = await addCollaborator(token, vault.owner, vault.repo, usernameResult.data, parsed.data.permission);
    return c.json({
      status: result.status === 201 ? "invited" : "added",
      invitation: result.invitation,
    });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * DELETE /vaults/:id/members/:username — remove a collaborator.
 */
vaultRoutes.delete("/vaults/:id/members/:username", vaultMutationLimit, async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const id = c.req.param("id");
  const username = c.req.param("username");
  const usernameResult = GithubUsername.safeParse(username);
  if (!usernameResult.success) return c.json({ error: "invalid_username" }, 400);
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ ok: true });
  }
  try {
    await removeCollaborator(token, vault.owner, vault.repo, usernameResult.data);
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * DELETE /vaults/:id/invitations/:invitationId — cancel a pending invite.
 */
vaultRoutes.delete("/vaults/:id/invitations/:invitationId", vaultMutationLimit, async (c) => {
  const { user, token } = await requireUserAndToken(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  const id = c.req.param("id");
  const invitationId = Number(c.req.param("invitationId"));
  if (!Number.isInteger(invitationId) || invitationId <= 0) {
    return c.json({ error: "invalid_invitation_id" }, 400);
  }
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ ok: true });
  }
  try {
    await cancelInvitation(token, vault.owner, vault.repo, invitationId);
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * GET /vault/list?prefix=notes/ — list all blobs under a prefix.
 */
vaultRoutes.get("/list", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const prefix = c.req.query("prefix") ?? "";
  if (!env.isProd && token === "dev_github_token") {
    return c.json({ entries: [] });
  }
  try {
    const entries = await gitOps(vault.provider).listTree(token, vault.owner, vault.repo, vault.branch, prefix);
    return c.json({
      entries: entries.map((e) => ({ path: e.path, sha: e.sha })),
    });
  } catch (err) {
    return ghErr(c, err);
  }
});

// ── NoteKit-hosted Git (Forgejo) endpoints ────────────────────────────────────

/**
 * POST /vault/notekit/provision — create (or retrieve) the user's Forgejo
 * account. Idempotent. Requires FORGEJO_ADMIN_TOKEN to be set on the server.
 */
vaultRoutes.post("/notekit/provision", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!env.forgejo.adminToken) {
    return c.json({ error: "forgejo_not_configured" }, 503);
  }
  try {
    const account = await provisionForgejoAccount(
      user.id,
      user.email,
      user.name ?? null,
    );
    return c.json({
      ok: true,
      username: account.username,
      gitUrl: env.forgejo.url ?? null,
    });
  } catch (err) {
    console.error("[vault] forgejo provision error:", err);
    return c.json({ error: "provision_failed", message: (err as Error).message }, 502);
  }
});

/**
 * GET /vault/notekit/repos — list repos in the user's Forgejo account.
 */
vaultRoutes.get("/notekit/repos", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!env.forgejo.adminToken) return c.json({ error: "forgejo_not_configured" }, 503);
  const token = await getForgejoToken(user.id);
  if (!token) return c.json({ error: "not_provisioned" }, 400);
  try {
    const repos = await fj.listRepos(token);
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
 * POST /vault/notekit/repos — create a new Forgejo repo.
 */
vaultRoutes.post("/notekit/repos", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!env.forgejo.adminToken) return c.json({ error: "forgejo_not_configured" }, 503);
  const token = await getForgejoToken(user.id);
  if (!token) return c.json({ error: "not_provisioned" }, 400);
  const parsed = await parseBody(c, CreateRepoBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const repo = await fj.createRepo(token, parsed.data.name, parsed.data.private ?? true);
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
