import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import {
  publishVaultEvent,
  subscribeVault,
  type VaultEvent,
} from "../lib/vault-events";
import { issueSseTicket, redeemSseTicket } from "../auth/sseTickets";
import { getCurrentUser } from "../auth/sessions";
import { getActingAgent } from "../auth/agentAuth";
import { getVaultToken, type GitProvider } from "../vault/tokens";
import { provisionForgejoAccount } from "../vault/forgejoAccounts";
import { checkWriteAllowed, refreshUsedBytesIfStale } from "../vault/quota";
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
import * as gl from "../vault/gitlab";
import { GhError, type GitAuthor } from "../vault/github";
import { encryptToken } from "../auth/tokenCrypto";
import { readAgent, defaultEmailFor } from "../vault/agents";
import { emitAgentEvent } from "../notifications/emit";
import { isPlus } from "../iap/entitlement";

function gitOps(provider: GitProvider) {
  if (provider === "notekit") return fj;
  if (provider === "gitlab") return gl;
  return gh;
}

/**
 * Dev-mode shortcut: the auth/dev-vault and auth/dev-login flows seed
 * sentinel tokens that the route layer recognizes and short-circuits with
 * fixture responses, so a developer can exercise the UI without standing
 * up real GitHub repos or a Forgejo container.
 */
function isDevToken(token: string): boolean {
  return token === "dev_github_token" || token === "dev_forgejo_token";
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
// Auto-provisioning creates a real Forgejo user + repo on our infra, so the
// limit is strict: a single user shouldn't need more than one provision
// attempt per hour under normal use, and a hard daily cap stops abuse from
// turning a free signup into a free file host.
const provisionLimit = rateLimit({
  bucket: "vault-provision",
  windowMs: 60 * 60_000, // 1 hour
  max: 3,
});

export const vaultRoutes = new Hono();

vaultRoutes.route("/pair", pairRoutes);

/**
 * Resolve the acting principal: either a session user, or an agent acting
 * on behalf of the user that created it. Returns the underlying user id (so
 * downstream code can resolve the user's active vault and dispatch to the
 * right token) plus the optional acting agent slug. Vault token retrieval
 * is intentionally NOT done here — that's the caller's job, after it knows
 * which vault is being operated on, via `getVaultToken(userId, provider)`.
 */
async function requirePrincipal(c: Context): Promise<{
  userId: string | null;
  actingAs: string | null;
}> {
  const agent = await getActingAgent(c);
  if (agent) {
    return { userId: agent.userId, actingAs: agent.agentSlug };
  }
  const user = await getCurrentUser(c);
  if (!user) return { userId: null, actingAs: null };
  return { userId: user.id, actingAs: null };
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
    // Surface rate limits as a typed, retryable error (issue #13). GitHub's
    // secondary limit is a 403 whose body mentions "rate limit"; the primary
    // limit is 429. Either way the client should back off and retry, not treat
    // it as a hard failure.
    if (err.status === 429 || (err.status === 403 && /rate limit/i.test(err.body))) {
      return c.json({ error: "rate_limited", status: err.status, message }, 429);
    }
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
  const [hasGithubToken, hasGitlabToken] = await Promise.all([
    getVaultToken(user.id, "github").then(Boolean),
    getVaultToken(user.id, "gitlab").then(Boolean),
  ]);
  return c.json({
    configured: Boolean(active),
    hasGithubToken,
    hasGitlabToken,
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

  // Bulk import bypasses the per-write quota guard on PUT /file, so we
  // re-check here before kicking off the loop. Catches the common case where
  // a user with a near-full managed vault imports a large source vault and
  // would otherwise discover the limit halfway through. Per-write enforcement
  // would still kick in via the underlying writeFile calls, but failing
  // upfront is friendlier.
  if (dstProvider === "notekit") {
    await refreshUsedBytesIfStale(userId);
    const guard = await checkWriteAllowed(userId, dstProvider);
    if (!guard.ok) {
      return c.json(
        {
          error: guard.reason,
          quotaBytes: guard.state.quotaBytes,
          usedBytes: guard.state.usedBytes,
        },
        413,
      );
    }
  }

  if (inFlightImports.has(userId)) {
    return c.json({ error: "import_already_running" }, 429);
  }
  inFlightImports.add(userId);

  if (!env.isProd && isDevToken(srcToken)) {
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
        const writeRes = await gitOps(dstProvider).writeFile(
          dstToken,
          dest.owner,
          dest.repo,
          item.path,
          file.content,
          `notekit: import ${item.path} from ${source.owner}/${source.repo}`,
          dest.branch,
        );
        publishVaultEvent(dest.id, {
          type: "write",
          path: item.path,
          sha: writeRes.sha,
        });
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
function providerFromQuery(c: Context): GitProvider {
  const q = c.req.query("provider");
  if (q === "notekit") return "notekit";
  if (q === "gitlab") return "gitlab";
  return "github";
}

const DEV_GH_REPOS = [
  {
    id: 1,
    name: "vault-primary",
    fullName: "dev/vault-primary",
    owner: "dev",
    private: true,
    defaultBranch: "main",
    description: "Dev primary vault",
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: 2,
    name: "vault-archive",
    fullName: "dev/vault-archive",
    owner: "dev",
    private: true,
    defaultBranch: "main",
    description: "Dev archive vault",
    updatedAt: new Date(0).toISOString(),
  },
];

const DEV_FJ_REPOS = [
  {
    id: 101,
    name: "notekit",
    fullName: "dev-notekit/notekit",
    owner: "dev-notekit",
    private: true,
    defaultBranch: "main",
    description: "Dev NoteKit-hosted vault",
    updatedAt: new Date(0).toISOString(),
  },
];

/**
 * GET /vault/repos?provider=github|gitlab|notekit — list the user's repos on
 * the given backend. Defaults to github so existing clients keep working.
 */
vaultRoutes.get("/repos", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const provider = providerFromQuery(c);
  const token = await getVaultToken(user.id, provider);
  if (!token) return c.json({ error: "vault_token_missing", provider }, 400);
  // Dev fixtures: fake tokens never hit the real backend.
  if (!env.isProd && token === "dev_github_token") return c.json({ repos: DEV_GH_REPOS });
  if (!env.isProd && token === "dev_forgejo_token") return c.json({ repos: DEV_FJ_REPOS }); // provider-specific fixtures, intentional
  try {
    const repos = await gitOps(provider).listRepos(token);
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
 * POST /vault/repos?provider=github|gitlab|notekit — create a new repo to
 * act as a vault. Defaults to github.
 */
vaultRoutes.post("/repos", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const provider = providerFromQuery(c);
  const token = await getVaultToken(user.id, provider);
  if (!token) return c.json({ error: "vault_token_missing", provider }, 400);
  const parsed = await parseBody(c, CreateRepoBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const repo = await gitOps(provider).createRepo(
      token,
      parsed.data.name,
      parsed.data.private ?? true,
    );
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
 * GET /vault/whoami?provider=github|gitlab|notekit — return the user's
 * login on the given backend. Defaults to the active vault's provider,
 * falling back to github so older clients keep working.
 */
vaultRoutes.get("/whoami", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const queryProvider = c.req.query("provider");
  let provider: GitProvider;
  if (
    queryProvider === "github" ||
    queryProvider === "gitlab" ||
    queryProvider === "notekit"
  ) {
    provider = queryProvider;
  } else {
    const active = await getActiveVault(user.id);
    provider = (active?.provider as GitProvider) ?? "github";
  }
  const token = await getVaultToken(user.id, provider);
  if (!token) return c.json({ error: "vault_token_missing", provider }, 400);
  if (!env.isProd && isDevToken(token)) {
    return c.json({
      provider,
      login: provider === "notekit" ? "dev-notekit" : "dev",
    });
  }
  try {
    const login = await gitOps(provider).getUserLogin(token);
    return c.json({ provider, login });
  } catch (err) {
    return ghErr(c, err);
  }
});

async function resolveVault(userId: string) {
  const active = await getActiveVault(userId);
  if (!active) return null;
  return {
    id: active.id,
    owner: active.owner,
    repo: active.repo,
    branch: active.branch,
    provider: active.provider as GitProvider,
  };
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
  if (!env.isProd && isDevToken(token)) {
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

  // NoteKit-hosted vaults are subject to a storage quota — refresh the
  // cached usage (cheap when fresh) and reject if the user is over.
  // GitHub vaults bypass this check.
  if (vault.provider === "notekit") {
    await refreshUsedBytesIfStale(userId);
    const guard = await checkWriteAllowed(userId, vault.provider);
    if (!guard.ok) {
      return c.json(
        {
          error: guard.reason,
          quotaBytes: guard.state.quotaBytes,
          usedBytes: guard.state.usedBytes,
        },
        413,
      );
    }
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
      if (!env.isProd && isDevToken(token)) {
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
  if (!env.isProd && isDevToken(token)) {
    // Publish even in the dev stub branch so the SSE loop is exercisable
    // end-to-end without a real Git backend. Without this, dev-mode writes
    // would silently bypass cross-device sync notifications.
    publishVaultEvent(vault.id, {
      type: "write",
      path: body.path,
      sha: "dev_sha_000",
    });
    return c.json({ path: body.path, sha: "dev_sha_000", content: body.content });
  }
  try {
    if (actingAs) {
      const found = await readAgent(vault.provider, token, vault.owner, vault.repo, vault.branch, actingAs);
      if (!found) return c.json({ error: "agent_profile_missing", slug: actingAs }, 409);
      const author: GitAuthor = {
        name: found.profile.name,
        email: found.profile.email || defaultEmailFor(actingAs),
      };
      const login = await gitOps(vault.provider).getUserLogin(token);
      // GitHub publishes `<login>@users.noreply.github.com` for users who
      // hide their email; GitLab uses the same `users.noreply.gitlab.com`
      // shape; Forgejo follows the same convention rooted at its own host.
      // The committer email is informational on commits and doesn't have to
      // map to a real inbox.
      const committerHost =
        vault.provider === "notekit"
          ? `users.noreply.${env.forgejo.domain ?? "notekit.app"}`
          : vault.provider === "gitlab"
            ? "users.noreply.gitlab.com"
            : "users.noreply.github.com";
      const committer: GitAuthor = {
        name: login,
        email: `${login}@${committerHost}`,
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
      publishVaultEvent(vault.id, {
        type: "write",
        path: body.path,
        sha: result.sha,
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
    publishVaultEvent(vault.id, {
      type: "write",
      path: body.path,
      sha: result.sha,
    });
    return c.json({ path: body.path, sha: result.sha, actor: "user" });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * PUT /vault/files — commit MANY files in a SINGLE commit (issue #13).
 * body: { files: [{ path, content }], message? }
 *
 * The batched alternative to N × PUT /vault/file, which is N commits and trips
 * GitHub's secondary rate limit. Used by the vault re-encrypt paths. Authored
 * as the user (no agent attribution needed for a bulk re-seal).
 */
vaultRoutes.put("/files", writeLimit, async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const body = (await c.req.json().catch(() => null)) as {
    files?: { path?: string; content?: string }[];
    message?: string;
  } | null;
  const files = (body?.files ?? []).filter(
    (f): f is { path: string; content: string } =>
      !!f && typeof f.path === "string" && typeof f.content === "string",
  );
  if (files.length === 0) return c.json({ error: "files_required" }, 400);

  if (vault.provider === "notekit") {
    await refreshUsedBytesIfStale(userId);
    const guard = await checkWriteAllowed(userId, vault.provider);
    if (!guard.ok) {
      return c.json(
        { error: guard.reason, quotaBytes: guard.state.quotaBytes, usedBytes: guard.state.usedBytes },
        413,
      );
    }
  }

  if (!env.isProd && isDevToken(token)) {
    for (const f of files) {
      publishVaultEvent(vault.id, { type: "write", path: f.path, sha: "dev_sha_000" });
    }
    return c.json({ commitSha: "dev_sha_000", count: files.length });
  }

  try {
    const result = await gitOps(vault.provider).commitFiles(
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      files,
      body?.message ?? `notekit: update ${files.length} files`,
    );
    for (const f of files) {
      publishVaultEvent(vault.id, { type: "write", path: f.path, sha: result.commitSha });
    }
    return c.json({ commitSha: result.commitSha, count: files.length });
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
  if (!env.isProd && isDevToken(token)) {
    // Dev stub mirrors the PUT branch: skip the real Git call but still
    // publish the event so SSE consumers see deletes in dev mode.
    publishVaultEvent(vault.id, { type: "delete", path: body.path });
    return c.json({ ok: true });
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
    publishVaultEvent(vault.id, { type: "delete", path: body.path });
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * POST /vault/events/ticket — mint a single-use, short-lived ticket the
 * caller can pass as `?ticket=` on `GET /vault/events`. Required for
 * bearer-only clients (CLI, MCP, desktop-PAT), because native EventSource
 * can't send an Authorization header. Cookie clients don't need this —
 * they can hit `/vault/events` directly with `credentials: include`.
 */
vaultRoutes.post("/events/ticket", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  try {
    const issued = issueSseTicket(userId);
    return c.json({
      ticket: issued.ticket,
      expiresAt: issued.expiresAt.toISOString(),
    });
  } catch (err) {
    if ((err as Error).message === "ticket_pool_full") {
      return c.json({ error: "ticket_pool_full" }, 503);
    }
    throw err;
  }
});

/**
 * GET /vault/events — server-sent events for cross-device sync. Emits
 * `write` and `delete` events whenever the caller's active vault is
 * mutated by any client (web/desktop/mobile/agent). Subscribers react by
 * re-pulling on their sync engine — debounced and gated, so a flurry of
 * edits doesn't translate into a flurry of refreshes.
 *
 * Heartbeats every 25s keep the connection alive through idle-timeout
 * proxies (nginx default 60s, Cloudflare 100s). The stream stays open
 * until the client closes it or the process terminates.
 *
 * Auth modes (in order):
 *   1. `?ticket=<nks_…>` — single-use, minted via POST /vault/events/ticket.
 *      Required for bearer-only clients (no header support in EventSource).
 *   2. Cookie / agent token — same path as the rest of /vault/*.
 */
vaultRoutes.get("/events", async (c) => {
  let userId: string | null = null;
  const ticketParam = c.req.query("ticket");
  if (ticketParam) {
    const redeemed = redeemSseTicket(ticketParam);
    if (!redeemed) return c.json({ error: "invalid_or_expired_ticket" }, 401);
    userId = redeemed.userId;
  } else {
    const principal = await requirePrincipal(c);
    userId = principal.userId;
  }
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const vaultId = vault.id;

  return streamSSE(c, async (stream) => {
    const queue: VaultEvent[] = [];
    let wake: (() => void) | null = null;
    let aborted = false;

    const wakeNow = () => {
      if (wake) {
        const r = wake;
        wake = null;
        r();
      }
    };

    stream.onAbort(() => {
      aborted = true;
      wakeNow();
    });

    const unsubscribe = subscribeVault(vaultId, (event) => {
      queue.push(event);
      wakeNow();
    });

    try {
      // Send a ready event so the client can reset its reconnect backoff
      // on first successful connect.
      await stream.writeSSE({ data: "{}", event: "ready" });

      const HEARTBEAT_MS = 25_000;

      while (!aborted) {
        // Drain anything that arrived while we weren't watching.
        while (queue.length > 0 && !aborted) {
          const ev = queue.shift()!;
          try {
            await stream.writeSSE({
              data: JSON.stringify(ev),
              event: ev.type,
            });
          } catch {
            // Stream is gone — bail out and let the finally{} clean up.
            aborted = true;
          }
        }
        if (aborted) break;

        // Wait for either a new event or the heartbeat tick, whichever
        // comes first. wake() races setTimeout().
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, HEARTBEAT_MS);
          wake = () => {
            clearTimeout(t);
            resolve();
          };
        });

        if (!aborted && queue.length === 0) {
          try {
            await stream.writeSSE({ data: "", event: "heartbeat" });
          } catch {
            aborted = true;
          }
        }
      }
    } finally {
      unsubscribe();
    }
  });
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
  if (!env.isProd && isDevToken(token)) {
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
    // Agent avatars used to be enriched here from per-agent stored URLs.
    // The store-no-avatar refactor moved that responsibility to the
    // client, which now computes the Gravatar URL inline from the commit's
    // author email. Pass commits through unchanged.
    return c.json({ commits });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * POST /vault/sync — proof-of-life sync. Reads the active vault's latest
 * commit so the caller (CLI / desktop) gets a sensible "everything's
 * reachable, branch is at <sha>" response without us doing any local Git
 * work (every file op already round-trips to the remote).
 *
 * This intentionally does NOT pull or push — there is no server-side
 * working copy. Future work: implement true sync once we add an offline
 * cache layer for desktop/CLI.
 */
vaultRoutes.post("/sync", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);

  // resolveVault returns a slim shape (owner/repo/branch/provider). Mirror
  // the same fields the CLI expects from VaultRef — no extra DB hop.
  const vaultRef = {
    provider: vault.provider,
    owner: vault.owner,
    repo: vault.repo,
    branch: vault.branch,
  };

  if (!env.isProd && isDevToken(token)) {
    return c.json({
      ok: true,
      vault: vaultRef,
      latestCommit: null,
      syncedAt: new Date().toISOString(),
    });
  }

  try {
    const commits = await gitOps(vault.provider).listCommits(
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      undefined,
      1,
    );
    return c.json({
      ok: true,
      vault: vaultRef,
      latestCommit: commits[0] ?? null,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * GET /vaults/:id/members — list collaborators + pending invitations.
 */
vaultRoutes.get("/vaults/:id/members", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  const token = await getVaultToken(user.id, vault.provider);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }
  if (!env.isProd && isDevToken(token)) {
    return c.json({ members: [], invitations: [] });
  }
  try {
    const ops = gitOps(vault.provider);
    const [members, invitations] = await Promise.all([
      ops.listCollaborators(token, vault.owner, vault.repo),
      ops.listInvitations(token, vault.owner, vault.repo),
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
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const username = c.req.param("username");
  const usernameResult = GithubUsername.safeParse(username);
  if (!usernameResult.success) return c.json({ error: "invalid_username" }, 400);
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  const token = await getVaultToken(user.id, vault.provider);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }
  const parsed = await parseBody(c, AddMemberBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  if (!env.isProd && isDevToken(token)) {
    return c.json({ status: "invited", invitation: null });
  }
  try {
    const result = await gitOps(vault.provider).addCollaborator(
      token,
      vault.owner,
      vault.repo,
      usernameResult.data,
      parsed.data.permission,
    );
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
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const username = c.req.param("username");
  const usernameResult = GithubUsername.safeParse(username);
  if (!usernameResult.success) return c.json({ error: "invalid_username" }, 400);
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  const token = await getVaultToken(user.id, vault.provider);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }
  if (!env.isProd && isDevToken(token)) {
    return c.json({ ok: true });
  }
  try {
    await gitOps(vault.provider).removeCollaborator(
      token,
      vault.owner,
      vault.repo,
      usernameResult.data,
    );
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * DELETE /vaults/:id/invitations/:invitationId — cancel a pending invite.
 */
vaultRoutes.delete("/vaults/:id/invitations/:invitationId", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const invitationId = Number(c.req.param("invitationId"));
  if (!Number.isInteger(invitationId) || invitationId <= 0) {
    return c.json({ error: "invalid_invitation_id" }, 400);
  }
  const vault = await getVaultById(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  const token = await getVaultToken(user.id, vault.provider);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }
  if (!env.isProd && isDevToken(token)) {
    return c.json({ ok: true });
  }
  try {
    await gitOps(vault.provider).cancelInvitation(
      token,
      vault.owner,
      vault.repo,
      invitationId,
    );
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
  if (!env.isProd && isDevToken(token)) {
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

// ── GitLab connect endpoints ─────────────────────────────────────────────────
//
// GitLab is BYO-storage only — the user pastes a Personal Access Token from
// gitlab.com (scopes: api, write_repository) and we store it encrypted in
// oauth_accounts under provider='gitlab'. There's no OAuth dance because
// auth is Google-only; GitLab is purely a storage backend.

const GitlabConnectBody = z.object({
  // PATs are ~26+ chars. We accept up to 200 to leave headroom for future
  // longer formats; the validity check is whether GitLab accepts it.
  token: z.string().min(8).max(200),
});

/**
 * GET /vault/gitlab/status — is GitLab connected and as which user?
 */
vaultRoutes.get("/gitlab/status", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const token = await getVaultToken(user.id, "gitlab");
  if (!token) return c.json({ connected: false, login: null });
  if (!env.isProd && isDevToken(token)) {
    return c.json({ connected: true, login: "dev-gitlab" });
  }
  try {
    const login = await gl.getUserLogin(token);
    return c.json({ connected: true, login });
  } catch (err) {
    // Token may have been revoked on GitLab's side. Surface as "not connected"
    // so the UI prompts a re-connect rather than blocking on a stale row.
    if (err instanceof GhError && (err.status === 401 || err.status === 403)) {
      return c.json({ connected: false, login: null, reason: "token_invalid" });
    }
    return ghErr(c, err);
  }
});

/**
 * POST /vault/gitlab/connect { token } — validate the PAT against GitLab,
 * then store it encrypted under provider='gitlab' in oauth_accounts.
 * Idempotent: re-connecting overwrites the existing row.
 */
vaultRoutes.post("/gitlab/connect", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, GitlabConnectBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  try {
    const info = await gl.getCurrentUserInfo(parsed.data.token);
    const encrypted = encryptToken(parsed.data.token);

    // Upsert by (provider, provider_account_id). If this GitLab account is
    // already linked to a *different* NoteKit user, reject — connecting the
    // same GitLab identity to two NoteKit users would let either of them
    // overwrite the other's vault contents.
    const existing = await db.query.oauthAccounts.findFirst({
      where: and(
        eq(schema.oauthAccounts.provider, "gitlab"),
        eq(schema.oauthAccounts.providerAccountId, String(info.id)),
      ),
    });
    if (existing && existing.userId !== user.id) {
      return c.json({ error: "gitlab_already_linked" }, 409);
    }
    if (existing) {
      await db
        .update(schema.oauthAccounts)
        .set({ accessToken: encrypted })
        .where(
          and(
            eq(schema.oauthAccounts.provider, "gitlab"),
            eq(schema.oauthAccounts.providerAccountId, String(info.id)),
          ),
        );
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
 * DELETE /vault/gitlab/connect — disconnect GitLab. Does NOT touch the
 * GitLab account itself; only forgets the PAT on our side.
 */
vaultRoutes.delete("/gitlab/connect", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  await db
    .delete(schema.oauthAccounts)
    .where(
      and(
        eq(schema.oauthAccounts.provider, "gitlab"),
        eq(schema.oauthAccounts.userId, user.id),
      ),
    );
  return c.json({ ok: true });
});

// ── NoteKit-hosted Git (Forgejo) endpoints ────────────────────────────────────

/**
 * POST /vault/notekit/provision — create (or retrieve) the user's Forgejo
 * account. Idempotent. Requires FORGEJO_ADMIN_TOKEN to be set on the server.
 */
vaultRoutes.post("/notekit/provision", provisionLimit, async (c) => {
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
    // The error message can include stack frames, file paths from the
    // forgejo HTTP client, or other internals we don't want to expose.
    // Log it server-side, surface a stable error code to the caller.
    console.error("[vault] forgejo provision error:", err);
    return c.json({ error: "provision_failed" }, 502);
  }
});

/**
 * GET /vault/notekit/repos — list repos in the user's Forgejo account.
 */
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
  const token = await getVaultToken(user.id, "notekit");
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
