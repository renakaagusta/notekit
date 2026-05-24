/**
 * Agent profile CRUD. Profiles live as JSON files in the user's vault repo;
 * auth secrets (token hashes) live in our SQLite DB. Plaintext tokens are
 * returned exactly once at creation.
 */
import { Hono, type Context } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "../db";
import { getCurrentUser } from "../auth/sessions";
import { getActiveVaultToken } from "../vault/tokens";
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
      { error: "vault_backend_error", status: err.status, message: err.message },
      502,
    );
  }
  console.error("[agents] unexpected error:", err);
  return c.json({ error: "server_error" }, 500);
}

/**
 * Resolve the user, their active vault, and the access token for that vault's
 * backend in one go. Replaces the old `requireUserVault` which read legacy
 * single-vault columns and only returned a GitHub token. Returns one of:
 *   { user: null }                              → 401
 *   { user, vault: null }                       → 409 no_vault_configured
 *   { user, vault, token: null }                → 400 vault_token_missing
 *   { user, vault, token }                      → ready to operate
 */
async function requireUserVault(c: Context) {
  const user = await getCurrentUser(c);
  if (!user) return { user: null, vault: null, token: null } as const;
  const { vault, token } = await getActiveVaultToken(user.id);
  return { user, vault, token } as const;
}

agentRoutes.get("/", async (c) => {
  const { user, vault, token } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }
  try {
    const agents = await listAgents(
      vault.provider,
      token,
      vault.owner,
      vault.repo,
      vault.branch,
    );
    return c.json({ agents });
  } catch (err) {
    return ghErr(c, err);
  }
});

agentRoutes.get("/:slug", async (c) => {
  const { user, vault, token } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }
  const slug = c.req.param("slug");
  try {
    const found = await readAgent(
      vault.provider,
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      slug,
    );
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
  const { user, vault, token } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }

  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    description?: string;
  } | null;
  if (!body?.name || typeof body.name !== "string") {
    return c.json({ error: "name_required" }, 400);
  }
  const trimmedName = body.name.trim();
  if (!trimmedName) return c.json({ error: "name_required" }, 400);

  const slug = slugifyAgentName(trimmedName);
  if (!slug) return c.json({ error: "invalid_name" }, 400);

  try {
    const existing = await readAgent(
      vault.provider,
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      slug,
    );
    if (existing) return c.json({ error: "slug_taken", slug }, 409);

    const resolvedEmail = body.email?.trim() || defaultEmailFor(slug);
    const profile: AgentProfile = {
      slug,
      name: trimmedName,
      email: resolvedEmail,
      description: body.description?.trim() ?? "",
      createdAt: new Date().toISOString(),
    };

    await writeAgent(
      vault.provider,
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      profile,
    );

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
  const { user, vault, token } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }

  const slug = c.req.param("slug");
  const body = (await c.req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    description?: string;
  } | null;
  if (!body) return c.json({ error: "invalid_body" }, 400);

  try {
    const found = await readAgent(
      vault.provider,
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      slug,
    );
    if (!found) return c.json({ error: "not_found" }, 404);

    const next: AgentProfile = {
      ...found.profile,
      name: body.name?.trim() || found.profile.name,
      email: body.email?.trim() || found.profile.email,
      description:
        body.description !== undefined
          ? body.description.trim()
          : found.profile.description,
    };

    await writeAgent(
      vault.provider,
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      next,
      found.sha,
    );

    return c.json({ agent: next });
  } catch (err) {
    return ghErr(c, err);
  }
});

/**
 * DELETE /agents/:slug — revoke all tokens for an agent and delete the file.
 */
agentRoutes.delete("/:slug", async (c) => {
  const { user, vault, token } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }
  const slug = c.req.param("slug");
  try {
    const found = await readAgent(
      vault.provider,
      token,
      vault.owner,
      vault.repo,
      vault.branch,
      slug,
    );
    if (found) {
      await deleteAgentFile(
        vault.provider,
        token,
        vault.owner,
        vault.repo,
        vault.branch,
        slug,
        found.sha,
      );
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
