import { streamSSE } from "hono/streaming";
import { GhError, type GitAuthor } from "../adapters/driven/git/github";
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
} from "../adapters/driven/vault/store";
import { getVaultToken } from "../adapters/driven/vault/tokens";
import {
  publishVaultEvent,
  subscribeVault,
  type VaultEvent,
} from "../application/vault-events";
import { getCurrentUser } from "../auth/sessions";
import { isPlus } from "../domain/entitlement";
import { sanitizeVaultPath, VaultPathError } from "../domain/path-sanitize";
import { issueSseTicket, redeemSseTicket } from "../domain/sseTickets";
import { env } from "../env";
import { emitAgentEvent } from "../notifications/emit";
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
} from "../validation";
import { readAgent, defaultEmailFor } from "../vault/agents";
import { checkWriteAllowed, refreshUsedBytesIfStale } from "../vault/quota";
import { pairRoutes } from "./pair";
import { vaultRoutes } from "./vault-router";
import {
  gitOps,
  isDevToken,
  ghErr,
  requirePrincipal,
  resolveVault,
  providerFromQuery,
  vaultMutationLimit,
  writeLimit,
  importLimit,
  MOBILE_FREE_NOTE_CAP,
  DEV_GH_REPOS,
  DEV_FJ_REPOS,
} from "./vault-shared";
// Side-effect imports: register member and provider routes on vaultRoutes.
import "./vault-members";
import "./vault-providers";

export { vaultRoutes };

// Folder prefixes that count as importable NoteKit content.
const IMPORT_PREFIXES = ["notes/", "tickets/", "journal/", "attachments/"];

// Cap how many source files we'll process in one import.
const IMPORT_FILE_CAP = 500;

// Single-flight per user: only one import may be in progress at a time.
const inFlightImports = new Set<string>();

vaultRoutes.route("/pair", pairRoutes);

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
 * GET /vault/status — the active vault for this user, if any.
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
  return c.json({ activeId: active?.id ?? null, vaults: vaults.map(vaultToRef) });
});

const CreateVaultBody = z.object({
  provider: VaultProviderEnum.optional().default("github"),
  owner: OwnerName,
  repo: RepoName,
  branch: BranchName.optional().default("main"),
  label: Label.optional(),
});

/**
 * POST /vaults — register a new vault and set it as active.
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

/** POST /vaults/:id/select — make this vault the active one. */
vaultRoutes.post("/vaults/:id/select", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const vault = await setActiveVault(user.id, id);
  if (!vault) return c.json({ error: "vault_not_found" }, 404);
  return c.json({ activeId: vault.id, vault: vaultToRef(vault) });
});

const PatchVaultBody = z
  .object({ label: LabelNullable.optional(), branch: BranchName.optional() })
  .refine((b) => b.label !== undefined || b.branch !== undefined, { message: "no_fields_to_update" });

/** PATCH /vaults/:id — rename or change the tracked branch. */
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

/** DELETE /vaults/:id — unregister the vault from NoteKit. */
vaultRoutes.delete("/vaults/:id", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  const result = await removeVault(user.id, id);
  if (!result.deleted) return c.json({ error: "vault_not_found" }, 404);
  return c.json({ ok: true, activeId: result.newActiveId });
});

/** GET /vaults/:id/settings — per-vault preferences. */
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

/** PATCH /vaults/:id/settings — partial update of per-vault preferences. */
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

// ── Import ────────────────────────────────────────────────────────────────────

const ImportBody = z.object({ sourceId: z.string().min(1).max(64) });

type GitOpsProvider = Parameters<typeof gitOps>[0];
type GopsFn = ReturnType<typeof gitOps>;
interface RepoCoords { owner: string; repo: string; branch: string; }

async function buildDestPaths(dstOps: GopsFn, dstToken: string, dest: RepoCoords): Promise<Set<string>> {
  const destPaths = new Set<string>();
  for (const prefix of IMPORT_PREFIXES) {
    const entries = await dstOps.listTree(dstToken, dest.owner, dest.repo, dest.branch, prefix);
    for (const e of entries) destPaths.add(e.path);
  }
  return destPaths;
}

async function planImport(
  srcOps: GopsFn,
  srcToken: string,
  source: RepoCoords,
  destPaths: Set<string>,
): Promise<{ paths: { path: string }[]; skipped: number }> {
  const plan: { path: string }[] = [];
  let skipped = 0;
  for (const prefix of IMPORT_PREFIXES) {
    const entries = await srcOps.listTree(srcToken, source.owner, source.repo, source.branch, prefix);
    for (const entry of entries) {
      if (destPaths.has(entry.path)) { skipped++; continue; }
      plan.push({ path: entry.path });
    }
  }
  return { paths: plan, skipped };
}

interface CopyArgs {
  plan: { path: string }[];
  srcOps: GopsFn; srcToken: string; source: RepoCoords;
  dstOps: GopsFn; dstToken: string; dest: RepoCoords & { id: string };
}

async function executeCopyPlan(args: CopyArgs): Promise<{ imported: number; errors: { path: string; reason: string }[] }> {
  const { plan, srcOps, srcToken, source, dstOps, dstToken, dest } = args;
  let imported = 0;
  const errors: { path: string; reason: string }[] = [];
  for (const item of plan) {
    try {
      const file = await srcOps.readFile(srcToken, source.owner, source.repo, item.path, source.branch);
      if (!file) continue;
      const writeRes = await dstOps.writeFile(
        dstToken, dest.owner, dest.repo, item.path, file.content,
        `notekit: import ${item.path} from ${source.owner}/${source.repo}`, dest.branch,
      );
      publishVaultEvent(dest.id, { type: "write", path: item.path, sha: writeRes.sha });
      imported++;
    } catch (e) {
      errors.push({ path: item.path, reason: e instanceof GhError ? `gh:${e.status}` : (e as Error).message });
    }
  }
  return { imported, errors };
}

/** POST /vaults/:destId/import — copy notes/tickets/journals/attachments from another vault. */
vaultRoutes.post("/vaults/:destId/import", importLimit, async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const destId = c.req.param("destId");
  const parsed = await parseBody(c, ImportBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  if (parsed.data.sourceId === destId) return c.json({ error: "source_and_dest_same" }, 400);

  const [source, dest] = await Promise.all([
    getVaultById(userId, parsed.data.sourceId),
    getVaultById(userId, destId),
  ]);
  if (!source) return c.json({ error: "source_vault_not_found" }, 404);
  if (!dest) return c.json({ error: "dest_vault_not_found" }, 404);

  const srcProvider = source.provider as GitOpsProvider;
  const dstProvider = dest.provider as GitOpsProvider;
  const [srcToken, dstToken] = await Promise.all([
    getVaultToken(userId, srcProvider),
    getVaultToken(userId, dstProvider),
  ]);
  if (!srcToken || !dstToken) return c.json({ error: "no_git_token" }, 400);

  if (dstProvider === "notekit") {
    await refreshUsedBytesIfStale(userId);
    const guard = await checkWriteAllowed(userId, dstProvider);
    if (!guard.ok) {
      return c.json({ error: guard.reason, quotaBytes: guard.state.quotaBytes, usedBytes: guard.state.usedBytes }, 413);
    }
  }

  if (inFlightImports.has(userId)) return c.json({ error: "import_already_running" }, 429);
  inFlightImports.add(userId);

  if (!env.isProd && isDevToken(srcToken)) {
    inFlightImports.delete(userId);
    return c.json({ imported: 0, skipped: 0, errors: [] });
  }

  try {
    const srcOps = gitOps(srcProvider);
    const dstOps = gitOps(dstProvider);
    const destPaths = await buildDestPaths(dstOps, dstToken, dest);
    const { paths: plan, skipped } = await planImport(srcOps, srcToken, source, destPaths);

    if (plan.length > IMPORT_FILE_CAP) {
      return c.json({
        error: "import_too_large",
        message: `Import is capped at ${IMPORT_FILE_CAP} files; source has ${plan.length} new files to copy.`,
        cap: IMPORT_FILE_CAP,
        would_import: plan.length,
      }, 413);
    }

    const { imported, errors } = await executeCopyPlan({ plan, srcOps, srcToken, source, dstOps, dstToken, dest });
    return c.json({ imported, skipped, errors });
  } catch (err) {
    return ghErr(c, err);
  } finally {
    inFlightImports.delete(userId);
  }
});

// ── Repos / whoami ────────────────────────────────────────────────────────────

const CreateRepoBody = z.object({ name: RepoName, private: z.boolean().optional() });

/** GET /vault/repos?provider=github|gitlab|notekit */
vaultRoutes.get("/repos", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const provider = providerFromQuery(c);
  const token = await getVaultToken(user.id, provider);
  if (!token) return c.json({ error: "vault_token_missing", provider }, 400);
  if (!env.isProd && token === "dev_github_token") return c.json({ repos: DEV_GH_REPOS });
  if (!env.isProd && token === "dev_forgejo_token") return c.json({ repos: DEV_FJ_REPOS });
  try {
    const repos = await gitOps(provider).listRepos(token);
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

/** POST /vault/repos?provider=github|gitlab|notekit */
vaultRoutes.post("/repos", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const provider = providerFromQuery(c);
  const token = await getVaultToken(user.id, provider);
  if (!token) return c.json({ error: "vault_token_missing", provider }, 400);
  const parsed = await parseBody(c, CreateRepoBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  try {
    const repo = await gitOps(provider).createRepo(token, parsed.data.name, parsed.data.private ?? true);
    return c.json({ repo: { owner: repo.owner.login, name: repo.name, defaultBranch: repo.default_branch } });
  } catch (err) {
    return ghErr(c, err);
  }
});

const LegacySelectBody = z.object({
  owner: OwnerName,
  repo: RepoName,
  branch: BranchName.optional().default("main"),
});

/** POST /vault/select — legacy single-vault entry point. */
vaultRoutes.post("/select", vaultMutationLimit, async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, LegacySelectBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const vault = await createVault({
    userId: user.id, provider: "github",
    owner: parsed.data.owner, repo: parsed.data.repo, branch: parsed.data.branch,
  });
  await setActiveVault(user.id, vault.id);
  c.header("Deprecation", "true");
  c.header("Sunset", "Sat, 16 Aug 2026 00:00:00 GMT");
  c.header("Link", '</vault/vaults>; rel="successor-version"');
  return c.json({ ok: true, vault: { id: vault.id, owner: vault.owner, repo: vault.repo, branch: vault.branch } });
});

/** GET /vault/whoami?provider=github|gitlab|notekit */
vaultRoutes.get("/whoami", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const queryProvider = c.req.query("provider");
  let provider: GitOpsProvider;
  if (queryProvider === "github" || queryProvider === "gitlab" || queryProvider === "notekit") {
    provider = queryProvider;
  } else {
    const active = await getActiveVault(user.id);
    provider = (active?.provider as GitOpsProvider) ?? "github";
  }
  const token = await getVaultToken(user.id, provider);
  if (!token) return c.json({ error: "vault_token_missing", provider }, 400);
  if (!env.isProd && isDevToken(token)) {
    return c.json({ provider, login: provider === "notekit" ? "dev-notekit" : "dev" });
  }
  try {
    const login = await gitOps(provider).getUserLogin(token);
    return c.json({ provider, login });
  } catch (err) {
    return ghErr(c, err);
  }
});

// ── File ops ──────────────────────────────────────────────────────────────────

/** GET /vault/file?path=...&ref=<sha|branch> */
vaultRoutes.get("/file", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const rawPath = c.req.query("path");
  if (!rawPath) return c.json({ error: "path_required" }, 400);
  let path: string;
  try {
    path = sanitizeVaultPath(rawPath);
  } catch (err) {
    if (err instanceof VaultPathError) return c.json({ error: "invalid_path", message: err.message }, 400);
    throw err;
  }
  const ref = c.req.query("ref") ?? vault.branch;
  if (!env.isProd && isDevToken(token)) return c.json({ path, content: null, sha: null });
  try {
    const file = await gitOps(vault.provider).readFile(token, vault.owner, vault.repo, path, ref);
    if (!file) return c.json({ path, content: null, sha: null });
    return c.json(file);
  } catch (err) {
    return ghErr(c, err);
  }
});

// ── PUT /file helpers ─────────────────────────────────────────────────────────

type ResolvedVault = NonNullable<Awaited<ReturnType<typeof resolveVault>>>;

async function isMobileFreeLimitHit(
  c: Parameters<typeof getCurrentUser>[0],
  vault: ResolvedVault,
  token: string,
): Promise<boolean> {
  const me = await getCurrentUser(c);
  if (!me || isPlus(me)) return false;
  if (!env.isProd && isDevToken(token)) return false;
  const entries = await gitOps(vault.provider).listTree(token, vault.owner, vault.repo, vault.branch, "notes/");
  return entries.length >= MOBILE_FREE_NOTE_CAP;
}

interface MobileWriteContext {
  actingAs: string | null;
  path: string;
  sha: string | undefined;
}

async function handleMobileCap(
  c: Parameters<typeof getCurrentUser>[0],
  vault: ResolvedVault,
  token: string,
  write: MobileWriteContext,
): Promise<boolean> {
  if (c.req.header("x-notekit-client") !== "mobile") return false;
  if (write.actingAs || write.sha || !write.path.startsWith("notes/")) return false;
  return isMobileFreeLimitHit(c, vault, token);
}

async function writeFileAsAgent(
  token: string,
  vault: ResolvedVault,
  body: { path: string; content: string; message?: string },
  actingAs: string,
  userId: string,
): Promise<{ path: string; sha: string; actor: string }> {
  const found = await readAgent({ provider: vault.provider, token, owner: vault.owner, repo: vault.repo, branch: vault.branch, slug: actingAs });
  if (!found) throw Object.assign(new Error("agent_profile_missing"), { code: "agent_profile_missing" });
  const author: GitAuthor = { name: found.profile.name, email: found.profile.email || defaultEmailFor(actingAs) };
  const login = await gitOps(vault.provider).getUserLogin(token);
  const committerHost =
    vault.provider === "notekit"
      ? `users.noreply.${env.forgejo.domain ?? "notekit.app"}`
      : vault.provider === "gitlab"
        ? "users.noreply.gitlab.com"
        : "users.noreply.github.com";
  const committer: GitAuthor = { name: login, email: `${login}@${committerHost}` };
  const result = await gitOps(vault.provider).writeFileAs(
    token, vault.owner, vault.repo, body.path, body.content,
    body.message ?? `notekit: ${actingAs} updated ${body.path}`,
    vault.branch, author, committer,
  );
  emitAgentEvent({ userId, agentSlug: actingAs, eventType: "file.write", resourcePath: body.path, extra: { sha: result.sha } });
  publishVaultEvent(vault.id, { type: "write", path: body.path, sha: result.sha });
  return { path: body.path, sha: result.sha, actor: `agent:${actingAs}` };
}

/** PUT /vault/file — create or update a file. */
// eslint-disable-next-line sonarjs/cognitive-complexity, complexity -- route handler: quota, mobile cap, dev stub, agent attribution, and user write are distinct necessary paths
vaultRoutes.put("/file", writeLimit, async (c) => {
  const { userId, actingAs } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const body = (await c.req.json().catch(() => null)) as {
    path?: string; content?: string; message?: string; sha?: string;
  } | null;
  if (!body?.path || typeof body.content !== "string") return c.json({ error: "path_and_content_required" }, 400);
  try {
    body.path = sanitizeVaultPath(body.path);
  } catch (err) {
    if (err instanceof VaultPathError) return c.json({ error: "invalid_path", message: err.message }, 400);
    throw err;
  }

  if (vault.provider === "notekit") {
    await refreshUsedBytesIfStale(userId);
    const guard = await checkWriteAllowed(userId, vault.provider);
    if (!guard.ok) return c.json({ error: guard.reason, quotaBytes: guard.state.quotaBytes, usedBytes: guard.state.usedBytes }, 413);
  }

  const capped = await handleMobileCap(c, vault, token, { actingAs, path: body.path, sha: body.sha });
  if (capped) return c.json({ error: "free_mobile_limit", cap: MOBILE_FREE_NOTE_CAP }, 403);

  if (!env.isProd && isDevToken(token)) {
    publishVaultEvent(vault.id, { type: "write", path: body.path, sha: "dev_sha_000" });
    return c.json({ path: body.path, sha: "dev_sha_000", content: body.content });
  }

  try {
    if (actingAs) {
      try {
        return c.json(await writeFileAsAgent(token, vault, { path: body.path, content: body.content, message: body.message }, actingAs, userId));
      } catch (e) {
        if ((e as { code?: string }).code === "agent_profile_missing") return c.json({ error: "agent_profile_missing", slug: actingAs }, 409);
        throw e;
      }
    }
    const result = await gitOps(vault.provider).writeFile(
      token, vault.owner, vault.repo, body.path, body.content,
      body.message ?? `notekit: update ${body.path}`, vault.branch, body.sha,
    );
    publishVaultEvent(vault.id, { type: "write", path: body.path, sha: result.sha });
    return c.json({ path: body.path, sha: result.sha, actor: "user" });
  } catch (err) {
    return ghErr(c, err);
  }
});

/** PUT /vault/files — commit many files in a single commit. */
// eslint-disable-next-line sonarjs/cognitive-complexity, complexity -- route handler: path sanitization, quota, dev stub, and commit each add necessary branches
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
  const rawFiles = (body?.files ?? []).filter(
    (f): f is { path: string; content: string } =>
      !!f && typeof f.path === "string" && typeof f.content === "string",
  );
  if (rawFiles.length === 0) return c.json({ error: "files_required" }, 400);
  let files: { path: string; content: string }[];
  try {
    files = rawFiles.map((f) => ({ path: sanitizeVaultPath(f.path), content: f.content }));
  } catch (err) {
    if (err instanceof VaultPathError) return c.json({ error: "invalid_path", message: err.message }, 400);
    throw err;
  }

  if (vault.provider === "notekit") {
    await refreshUsedBytesIfStale(userId);
    const guard = await checkWriteAllowed(userId, vault.provider);
    if (!guard.ok) return c.json({ error: guard.reason, quotaBytes: guard.state.quotaBytes, usedBytes: guard.state.usedBytes }, 413);
  }

  if (!env.isProd && isDevToken(token)) {
    for (const f of files) publishVaultEvent(vault.id, { type: "write", path: f.path, sha: "dev_sha_000" });
    return c.json({ commitSha: "dev_sha_000", count: files.length });
  }

  try {
    const result = await gitOps(vault.provider).commitFiles(
      token, vault.owner, vault.repo, vault.branch, files,
      body?.message ?? `notekit: update ${files.length} files`,
    );
    for (const f of files) publishVaultEvent(vault.id, { type: "write", path: f.path, sha: result.commitSha });
    return c.json({ commitSha: result.commitSha, count: files.length });
  } catch (err) {
    return ghErr(c, err);
  }
});

/** DELETE /vault/file — delete a file. */
vaultRoutes.delete("/file", writeLimit, async (c) => {
  const { userId, actingAs } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const body = (await c.req.json().catch(() => null)) as { path?: string; sha?: string; message?: string } | null;
  if (!body?.path || !body?.sha) return c.json({ error: "path_and_sha_required" }, 400);
  try {
    body.path = sanitizeVaultPath(body.path);
  } catch (err) {
    if (err instanceof VaultPathError) return c.json({ error: "invalid_path", message: err.message }, 400);
    throw err;
  }
  if (!env.isProd && isDevToken(token)) {
    publishVaultEvent(vault.id, { type: "delete", path: body.path });
    return c.json({ ok: true });
  }
  try {
    await gitOps(vault.provider).deleteFile(
      token, vault.owner, vault.repo, body.path,
      body.message ?? `notekit: delete ${body.path}`, vault.branch, body.sha,
    );
    if (actingAs) emitAgentEvent({ userId, agentSlug: actingAs, eventType: "file.delete", resourcePath: body.path });
    publishVaultEvent(vault.id, { type: "delete", path: body.path });
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});

// ── Events ────────────────────────────────────────────────────────────────────

/** POST /vault/events/ticket — mint a single-use SSE ticket. */
vaultRoutes.post("/events/ticket", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  try {
    const issued = issueSseTicket(userId);
    return c.json({ ticket: issued.ticket, expiresAt: issued.expiresAt.toISOString() });
  } catch (err) {
    if ((err as Error).message === "ticket_pool_full") return c.json({ error: "ticket_pool_full" }, 503);
    throw err;
  }
});

/** GET /vault/events — server-sent events for cross-device sync. */
vaultRoutes.get("/events", async (c) => {
  let userId: string | null = null;
  const ticketParam = c.req.query("ticket");
  if (ticketParam) {
    const redeemed = redeemSseTicket(ticketParam);
    if (!redeemed) return c.json({ error: "invalid_or_expired_ticket" }, 401);
    userId = redeemed.userId;
  } else {
    userId = (await requirePrincipal(c)).userId;
  }
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const vaultId = vault.id;

  return streamSSE(c, async (stream) => {
    const queue: VaultEvent[] = [];
    let wake: (() => void) | null = null;
    let aborted = false;
    const wakeNow = () => { if (wake) { const r = wake; wake = null; r(); } };
    stream.onAbort(() => { aborted = true; wakeNow(); });
    const unsubscribe = subscribeVault(vaultId, (event) => { queue.push(event); wakeNow(); });
    try {
      await stream.writeSSE({ data: "{}", event: "ready" });
      const HEARTBEAT_MS = 25_000;
      while (!aborted) {
        while (queue.length > 0 && !aborted) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- queue.length > 0 checked above
          const ev = queue.shift()!;
          try { await stream.writeSSE({ data: JSON.stringify(ev), event: ev.type }); }
          catch { aborted = true; }
        }
        if (aborted) break;
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, HEARTBEAT_MS);
          wake = () => { clearTimeout(t); resolve(); };
        });
        if (!aborted && queue.length === 0) {
          try { await stream.writeSSE({ data: "", event: "heartbeat" }); }
          catch { aborted = true; }
        }
      }
    } finally {
      unsubscribe();
    }
  });
});

// ── Commits / sync / list ─────────────────────────────────────────────────────

/** GET /vault/commits?path=...&limit=50 */
vaultRoutes.get("/commits", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const path = c.req.query("path") || undefined;
  const limit = Number(c.req.query("limit") ?? "50") || 50;
  if (!env.isProd && isDevToken(token)) return c.json({ commits: [] });
  try {
    const commits = await gitOps(vault.provider).listCommits(token, vault.owner, vault.repo, vault.branch, path, limit);
    return c.json({ commits });
  } catch (err) {
    return ghErr(c, err);
  }
});

/** POST /vault/sync — proof-of-life sync. */
vaultRoutes.post("/sync", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const vaultRef = { provider: vault.provider, owner: vault.owner, repo: vault.repo, branch: vault.branch };
  if (!env.isProd && isDevToken(token)) {
    return c.json({ ok: true, vault: vaultRef, latestCommit: null, syncedAt: new Date().toISOString() });
  }
  try {
    const commits = await gitOps(vault.provider).listCommits(token, vault.owner, vault.repo, vault.branch, undefined, 1);
    return c.json({ ok: true, vault: vaultRef, latestCommit: commits[0] ?? null, syncedAt: new Date().toISOString() });
  } catch (err) {
    return ghErr(c, err);
  }
});

/** GET /vault/list?prefix=notes/ */
vaultRoutes.get("/list", async (c) => {
  const { userId } = await requirePrincipal(c);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const vault = await resolveVault(userId);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const token = await getVaultToken(userId, vault.provider);
  if (!token) return c.json({ error: "no_git_token" }, 400);
  const prefix = c.req.query("prefix") ?? "";
  if (!env.isProd && isDevToken(token)) return c.json({ entries: [] });
  try {
    const entries = await gitOps(vault.provider).listTree(token, vault.owner, vault.repo, vault.branch, prefix);
    return c.json({ entries: entries.map((e) => ({ path: e.path, sha: e.sha })) });
  } catch (err) {
    return ghErr(c, err);
  }
});
