/**
 * Agent profile CRUD. Profiles live as JSON files in the user's vault repo;
 * auth secrets (token hashes) live in our DB. Plaintext tokens are returned
 * exactly once at creation.
 *
 * Driving adapter: parse request -> call the agents use case -> format the
 * response. All orchestration lives in `application/usecases/agents`.
 */
import { Hono, type Context } from "hono";
import {
  createAgentProfile,
  deleteAgentProfile,
  getAgentProfile,
  listAgentProfiles,
  requireAgentVault,
  updateAgentProfile,
} from "../../../composition/agents";
import { getCurrentUser } from "../../../composition/sessions";
import { GhError } from "../../../domain/errors";

export const agentRoutes = new Hono();

function ghErr(c: Context, err: unknown) {
  if (err instanceof GhError) {
    return c.json(
      { error: "vault_backend_error", status: err.status, message: err.message },
      502,
    );
  }
  return c.json({ error: "server_error" }, 500);
}

async function requireUserVault(c: Context) {
  const user = await getCurrentUser(c);
  return requireAgentVault(user?.id ?? null);
}

agentRoutes.get("/", async (c) => {
  const { user, vault, token } = await requireUserVault(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!vault) return c.json({ error: "no_vault_configured" }, 409);
  if (!token) {
    return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  }
  try {
    const agents = await listAgentProfiles(vault, token);
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
    const agent = await getAgentProfile(vault, token, slug);
    if (!agent) return c.json({ error: "not_found" }, 404);
    return c.json({ agent });
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

  try {
    const result = await createAgentProfile(user.id, vault, token, body);
    if (!result.ok) {
      if (result.error === "slug_taken") {
        return c.json({ error: "slug_taken", slug: result.slug }, 409);
      }
      return c.json({ error: result.error }, 400);
    }
    return c.json({ agent: result.agent, token: result.token });
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
    const result = await updateAgentProfile(vault, token, slug, body);
    if (!result.ok) return c.json({ error: "not_found" }, 404);
    return c.json({ agent: result.agent });
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
    await deleteAgentProfile(user.id, vault, token, slug);
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});
