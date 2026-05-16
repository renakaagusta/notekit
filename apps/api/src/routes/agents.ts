/**
 * Agent profile CRUD. Profiles live as JSON files in the user's vault repo;
 * auth secrets (token hashes) live in our SQLite DB. Plaintext tokens are
 * returned exactly once at creation.
 */
import { Hono, type Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db";
import { getCurrentUser } from "../auth/sessions";
import { getGithubToken } from "../vault/tokens";
import { GhError } from "../vault/github";
import {
  readAgent,
  listAgents,
  writeAgent,
  deleteAgentFile,
  defaultEmailFor,
  slugifyAgentName,
  type AgentProfile,
} from "../vault/agents";
import {
  generateAgentToken,
  newAgentTokenId,
} from "../auth/agentAuth";

export const agentRoutes = new Hono();

function ghErr(c: Context, err: unknown) {
  if (err instanceof GhError) {
    return c.json(
      { error: "github_error", status: err.status, message: err.message },
      502,
    );
  }
  console.error("[agents] unexpected error:", err);
  return c.json({ error: "server_error" }, 500);
}

async function requireUserVault(c: Context) {
  const user = await getCurrentUser(c);
  if (!user) return { user: null, token: null, vault: null } as const;
  const token = await getGithubToken(user.id);
  if (!token) return { user, token: null, vault: null } as const;
  const settings = await db.query.userSettings.findFirst({
    where: eq(schema.userSettings.userId, user.id),
  });
  if (!settings?.vaultOwner || !settings?.vaultRepo) {
    return { user, token, vault: null } as const;
  }
  return {
    user,
    token,
    vault: {
      owner: settings.vaultOwner,
      repo: settings.vaultRepo,
      branch: settings.vaultBranch ?? "main",
    },
  } as const;
}

/**
 * GET /agents — list agents from the user's vault.
 */
agentRoutes.get("/", async (c) => {
  const { user, token, vault } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  try {
    const agents = await listAgents(token, vault.owner, vault.repo, vault.branch);
    return c.json({ agents });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * GET /agents/:slug — read a single agent profile from the vault.
 */
agentRoutes.get("/:slug", async (c) => {
  const { user, token, vault } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const slug = c.req.param("slug");
  try {
    const found = await readAgent(token, vault.owner, vault.repo, vault.branch, slug);
    if (!found) return c.json({ error: "not_found" }, 404);
    return c.json({ agent: found.profile });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * POST /agents — create an agent.
 * body: { name, email?, avatarUrl? }
 * Returns { agent, token } — token is shown ONCE and never retrievable again.
 */
agentRoutes.post("/", async (c) => {
  const { user, token, vault } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);

  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    description?: string;
    avatarUrl?: string | null;
  } | null;
  if (!body?.name || typeof body.name !== "string") {
    return c.json({ error: "name_required" }, 400);
  }
  const trimmedName = body.name.trim();
  if (!trimmedName) return c.json({ error: "name_required" }, 400);

  const slug = slugifyAgentName(trimmedName);
  if (!slug) return c.json({ error: "invalid_name" }, 400);

  try {
    const existing = await readAgent(token, vault.owner, vault.repo, vault.branch, slug);
    if (existing) return c.json({ error: "slug_taken", slug }, 409);

    const profile: AgentProfile = {
      slug,
      name: trimmedName,
      email: body.email?.trim() || defaultEmailFor(slug),
      description: body.description?.trim() ?? "",
      avatarUrl: body.avatarUrl ?? null,
      createdAt: new Date().toISOString(),
    };

    await writeAgent(token, vault.owner, vault.repo, vault.branch, profile);

    const { plain, hash } = generateAgentToken();
    await db.insert(schema.agentTokens).values({
      id: newAgentTokenId(),
      userId: user.id,
      agentSlug: slug,
      tokenHash: hash,
    });

    return c.json({ agent: profile, token: plain });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * PATCH /agents/:slug — update editable fields (name, email, description, avatarUrl).
 * Slug stays immutable; renaming would split git history under a different path.
 */
agentRoutes.patch("/:slug", async (c) => {
  const { user, token, vault } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);

  const slug = c.req.param("slug");
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    description?: string;
    avatarUrl?: string | null;
  } | null;
  if (!body) return c.json({ error: "invalid_body" }, 400);

  try {
    const found = await readAgent(token, vault.owner, vault.repo, vault.branch, slug);
    if (!found) return c.json({ error: "not_found" }, 404);

    const next: AgentProfile = {
      ...found.profile,
      name: body.name?.trim() || found.profile.name,
      email: body.email?.trim() || found.profile.email,
      description:
        body.description !== undefined
          ? body.description.trim()
          : found.profile.description,
      avatarUrl:
        body.avatarUrl !== undefined ? body.avatarUrl : found.profile.avatarUrl,
    };

    await writeAgent(token, vault.owner, vault.repo, vault.branch, next, found.sha);
    return c.json({ agent: next });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * DELETE /agents/:slug — revoke all tokens for an agent and delete the file.
 */
agentRoutes.delete("/:slug", async (c) => {
  const { user, token, vault } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!token) return c.json({ error: "no_github_token" }, 400);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  const slug = c.req.param("slug");
  try {
    const found = await readAgent(token, vault.owner, vault.repo, vault.branch, slug);
    if (found) {
      await deleteAgentFile(token, vault.owner, vault.repo, vault.branch, slug, found.sha);
    }
    await db
      .update(schema.agentTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.agentTokens.userId, user.id),
          eq(schema.agentTokens.agentSlug, slug),
          isNull(schema.agentTokens.revokedAt),
        ),
      );
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});
