/**
 * Agent profile CRUD. Profiles live as JSON files in the user's vault repo;
 * auth secrets (token hashes) live in our SQLite DB. Plaintext tokens are
 * returned exactly once at creation.
 */
import { and, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db, schema } from "../adapters/driven/db";
import { GhError } from "../adapters/driven/git/github";
import {
  readAgent,
  listAgents,
  writeAgent,
  deleteAgentFile,
} from "../adapters/driven/vault/agentStore";
import { getActiveVaultToken } from "../adapters/driven/vault/tokens";
import {
  generateAgentToken,
  newAgentTokenId,
} from "../auth/agentAuth";
import { getCurrentUser } from "../composition/sessions";
import {
  defaultEmailFor,
  slugifyAgentName,
  type AgentProfile,
} from "../domain/agents";

export const agentRoutes = new Hono();

/**
 * Sanitize the optional chat-persona fields from a request body. On PATCH, a
 * field left undefined keeps the previous value; an explicit empty string
 * clears it. Unknown `toolPermissions` values are ignored (fall back to prev).
 */
type ChatFields = Pick<
  AgentProfile,
  "emoji" | "model" | "systemPrompt" | "toolPermissions" | "provider" | "baseUrl"
>;

/** Pick a free-text field: use trimmed body value if present, else keep prev. */
function pickStringField(
  bodyVal: string | undefined,
  prevVal: string | undefined,
): string | undefined {
  if (bodyVal !== undefined) {
    const v = bodyVal.trim();
    return v || undefined;
  }
  return prevVal;
}

/** Pick an enum field: accept only known values, else keep prev. */
function pickEnumField<T extends string>(
  bodyVal: string | undefined,
  allowed: readonly T[],
  prevVal: T | undefined,
): T | undefined {
  if (allowed.includes(bodyVal as T)) return bodyVal as T;
  return prevVal;
}

function normalizeChatFields(
  body: {
    emoji?: string;
    model?: string;
    systemPrompt?: string;
    toolPermissions?: string;
    provider?: string;
    baseUrl?: string;
  },
  prev?: AgentProfile,
): ChatFields {
  const out: ChatFields = {};
  const s = pickStringField;
  const e = pickEnumField;

  const emoji = s(body.emoji, prev?.emoji);
  if (emoji) out.emoji = emoji;

  const model = s(body.model, prev?.model);
  if (model) out.model = model;

  const systemPrompt = s(body.systemPrompt, prev?.systemPrompt);
  if (systemPrompt) out.systemPrompt = systemPrompt;

  const toolPermissions = e(body.toolPermissions, ["read-only", "read-write"] as const, prev?.toolPermissions);
  if (toolPermissions) out.toolPermissions = toolPermissions;

  const provider = e(body.provider, ["anthropic", "openai-compatible"] as const, prev?.provider);
  if (provider) out.provider = provider;

  const baseUrl = s(body.baseUrl, prev?.baseUrl);
  if (baseUrl) out.baseUrl = baseUrl;

  return out;
}

function ghErr(c: Context, err: unknown) {
  if (err instanceof GhError) {
    return c.json(
      { error: "vault_backend_error", status: err.status, message: err.message },
      502,
    );
  }
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
    const found = await readAgent({
      provider: vault.provider,
      token,
      owner: vault.owner,
      repo: vault.repo,
      branch: vault.branch,
      slug,
    });
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
    emoji?: string;
    model?: string;
    systemPrompt?: string;
    toolPermissions?: string;
    provider?: string;
    baseUrl?: string;
  } | null;
  if (!body?.name || typeof body.name !== "string") {
    return c.json({ error: "name_required" }, 400);
  }
  const trimmedName = body.name.trim();
  if (!trimmedName) return c.json({ error: "name_required" }, 400);

  const slug = slugifyAgentName(trimmedName);
  if (!slug) return c.json({ error: "invalid_name" }, 400);

  try {
    const existing = await readAgent({
      provider: vault.provider,
      token,
      owner: vault.owner,
      repo: vault.repo,
      branch: vault.branch,
      slug,
    });
    if (existing) return c.json({ error: "slug_taken", slug }, 409);

    const resolvedEmail = body.email?.trim() || defaultEmailFor(slug);
    const profile: AgentProfile = {
      slug,
      name: trimmedName,
      email: resolvedEmail,
      description: body.description?.trim() ?? "",
      createdAt: new Date().toISOString(),
      ...normalizeChatFields(body),
    };

    await writeAgent({
      provider: vault.provider,
      token,
      owner: vault.owner,
      repo: vault.repo,
      branch: vault.branch,
      profile,
    });

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
    emoji?: string;
    model?: string;
    systemPrompt?: string;
    toolPermissions?: string;
    provider?: string;
    baseUrl?: string;
  } | null;
  if (!body) return c.json({ error: "invalid_body" }, 400);

  try {
    const found = await readAgent({
      provider: vault.provider,
      token,
      owner: vault.owner,
      repo: vault.repo,
      branch: vault.branch,
      slug,
    });
    if (!found) return c.json({ error: "not_found" }, 404);

    const next: AgentProfile = {
      ...found.profile,
      name: body.name?.trim() || found.profile.name,
      email: body.email?.trim() || found.profile.email,
      description:
        body.description !== undefined
          ? body.description.trim()
          : found.profile.description,
      ...normalizeChatFields(body, found.profile),
    };

    await writeAgent({
      provider: vault.provider,
      token,
      owner: vault.owner,
      repo: vault.repo,
      branch: vault.branch,
      profile: next,
      prevSha: found.sha,
    });

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
    const found = await readAgent({
      provider: vault.provider,
      token,
      owner: vault.owner,
      repo: vault.repo,
      branch: vault.branch,
      slug,
    });
    if (found) {
      await deleteAgentFile({
        provider: vault.provider,
        token,
        owner: vault.owner,
        repo: vault.repo,
        branch: vault.branch,
        slug,
        prevSha: found.sha,
      });
    }
    await db
      .update(schema.agentTokens)
      .set({ revokedAt: Date.now() })
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
