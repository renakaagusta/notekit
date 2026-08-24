/**
 * Vault member management routes (collaborators + invitations).
 * Side-effect module: registers routes on the shared vaultRoutes instance.
 */
import { getVaultById } from "../adapters/driven/vault/store";
import { getVaultToken } from "../adapters/driven/vault/tokens";
import { getCurrentUser } from "../composition/sessions";
import { parseBody, z, GithubUsername, CollaboratorPermissionEnum } from "../validation";
import { vaultRoutes } from "./vault-router";
import { env, ghErr, gitOps, isDevToken, vaultMutationLimit } from "./vault-shared";

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
  if (!token) return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  if (!env.isProd && isDevToken(token)) return c.json({ members: [], invitations: [] });
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
  if (!token) return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  const parsed = await parseBody(c, AddMemberBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  if (!env.isProd && isDevToken(token)) return c.json({ status: "invited", invitation: null });
  try {
    const result = await gitOps(vault.provider).addCollaborator(
      token, vault.owner, vault.repo, usernameResult.data, parsed.data.permission,
    );
    return c.json({ status: result.status === 201 ? "invited" : "added", invitation: result.invitation });
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
  if (!token) return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  if (!env.isProd && isDevToken(token)) return c.json({ ok: true });
  try {
    await gitOps(vault.provider).removeCollaborator(token, vault.owner, vault.repo, usernameResult.data);
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
  if (!token) return c.json({ error: "vault_token_missing", provider: vault.provider }, 400);
  if (!env.isProd && isDevToken(token)) return c.json({ ok: true });
  try {
    await gitOps(vault.provider).cancelInvitation(token, vault.owner, vault.repo, invitationId);
    return c.json({ ok: true });
  } catch (err) {
    return ghErr(c, err);
  }
});
