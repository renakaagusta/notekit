/**
 * Agent-profile CRUD use cases. Profiles live as JSON files in the user's vault
 * repo; auth secrets (token hashes) live in our DB. Plaintext tokens are
 * returned exactly once at creation.
 *
 * Behaviour is identical to the previous `routes/agents` implementation; it now
 * reads/writes through the injected ports (agent store, vault token, agent-token
 * repository) instead of the concrete driven adapters and Drizzle. The driving
 * route is reduced to parse request -> call use case -> format response.
 */
import {
  defaultEmailFor,
  slugifyAgentName,
  type AgentProfile,
} from "../../domain/agents";
import { generateAgentToken, newAgentTokenId } from "../../domain/auth-tokens";
import type { AgentStorePort } from "../ports/out/AgentStorePort";
import type { AgentTokenRepository } from "../ports/out/AgentTokenRepository";
import type { ActiveVault, VaultTokenPort } from "../ports/out/VaultTokenPort";

type ChatFields = Pick<
  AgentProfile,
  "emoji" | "model" | "systemPrompt" | "toolPermissions" | "provider" | "baseUrl"
>;

interface ChatFieldsInput {
  emoji?: string;
  model?: string;
  systemPrompt?: string;
  toolPermissions?: string;
  provider?: string;
  baseUrl?: string;
}

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

/**
 * Sanitize the optional chat-persona fields from a request body. On update, a
 * field left undefined keeps the previous value; an explicit empty string
 * clears it. Unknown `toolPermissions`/`provider` values are ignored (fall back
 * to prev).
 */
function normalizeChatFields(body: ChatFieldsInput, prev?: AgentProfile): ChatFields {
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

export type VaultResolution =
  | { user: null; vault: null; token: null }
  | { user: { id: string }; vault: null; token: null }
  | { user: { id: string }; vault: ActiveVault; token: null }
  | { user: { id: string }; vault: ActiveVault; token: string };

export interface CreateAgentInput extends ChatFieldsInput {
  name?: string;
  email?: string;
  description?: string;
}

export interface UpdateAgentInput extends ChatFieldsInput {
  name?: string;
  email?: string;
  description?: string;
}

export type CreateAgentResult =
  | { ok: false; error: "name_required" | "invalid_name" }
  | { ok: false; error: "slug_taken"; slug: string }
  | { ok: true; agent: AgentProfile; token: string };

export type UpdateAgentResult =
  | { ok: false; error: "not_found" }
  | { ok: true; agent: AgentProfile };

interface AgentsDeps {
  store: AgentStorePort;
  vaultToken: VaultTokenPort;
  tokens: AgentTokenRepository;
}

/** Locate one agent file by slug, returning its parsed profile + sha or null. */
function readAgentBySlug(store: AgentStorePort, vault: ActiveVault, token: string, slug: string) {
  return store.readAgent({
    provider: vault.provider,
    token,
    owner: vault.owner,
    repo: vault.repo,
    branch: vault.branch,
    slug,
  });
}

async function requireUserVault(
  deps: AgentsDeps,
  userId: string | null,
): Promise<VaultResolution> {
  if (!userId) return { user: null, vault: null, token: null };
  const { vault, token } = await deps.vaultToken.getActiveVaultToken(userId);
  if (!vault) return { user: { id: userId }, vault: null, token: null };
  if (!token) return { user: { id: userId }, vault, token: null };
  return { user: { id: userId }, vault, token };
}

function listAgents(deps: AgentsDeps, vault: ActiveVault, token: string): Promise<AgentProfile[]> {
  return deps.store.listAgents(vault.provider, token, vault.owner, vault.repo, vault.branch);
}

async function getAgent(
  deps: AgentsDeps,
  vault: ActiveVault,
  token: string,
  slug: string,
): Promise<AgentProfile | null> {
  const found = await readAgentBySlug(deps.store, vault, token, slug);
  return found ? found.profile : null;
}

async function createAgent(
  deps: AgentsDeps,
  userId: string,
  vault: ActiveVault,
  token: string,
  input: CreateAgentInput,
): Promise<CreateAgentResult> {
  if (!input.name || typeof input.name !== "string") return { ok: false, error: "name_required" };
  const trimmedName = input.name.trim();
  if (!trimmedName) return { ok: false, error: "name_required" };

  const slug = slugifyAgentName(trimmedName);
  if (!slug) return { ok: false, error: "invalid_name" };

  const existing = await readAgentBySlug(deps.store, vault, token, slug);
  if (existing) return { ok: false, error: "slug_taken", slug };

  const resolvedEmail = input.email?.trim() || defaultEmailFor(slug);
  const profile: AgentProfile = {
    slug,
    name: trimmedName,
    email: resolvedEmail,
    description: input.description?.trim() ?? "",
    createdAt: new Date().toISOString(),
    ...normalizeChatFields(input),
  };

  await deps.store.writeAgent({
    provider: vault.provider,
    token,
    owner: vault.owner,
    repo: vault.repo,
    branch: vault.branch,
    profile,
  });

  const { plain, hash } = generateAgentToken();
  await deps.tokens.insertToken({
    id: newAgentTokenId(),
    userId,
    agentSlug: slug,
    tokenHash: hash,
  });

  return { ok: true, agent: profile, token: plain };
}

async function updateAgent(
  deps: AgentsDeps,
  vault: ActiveVault,
  token: string,
  slug: string,
  input: UpdateAgentInput,
): Promise<UpdateAgentResult> {
  const found = await readAgentBySlug(deps.store, vault, token, slug);
  if (!found) return { ok: false, error: "not_found" };

  const next: AgentProfile = {
    ...found.profile,
    name: input.name?.trim() || found.profile.name,
    email: input.email?.trim() || found.profile.email,
    description:
      input.description !== undefined
        ? input.description.trim()
        : found.profile.description,
    ...normalizeChatFields(input, found.profile),
  };

  await deps.store.writeAgent({
    provider: vault.provider,
    token,
    owner: vault.owner,
    repo: vault.repo,
    branch: vault.branch,
    profile: next,
    prevSha: found.sha,
  });

  return { ok: true, agent: next };
}

async function removeAgent(
  deps: AgentsDeps,
  userId: string,
  vault: ActiveVault,
  token: string,
  slug: string,
): Promise<void> {
  const found = await readAgentBySlug(deps.store, vault, token, slug);
  if (found) {
    await deps.store.deleteAgentFile({
      provider: vault.provider,
      token,
      owner: vault.owner,
      repo: vault.repo,
      branch: vault.branch,
      slug,
      prevSha: found.sha,
    });
  }
  await deps.tokens.revokeTokensForAgent(userId, slug, Date.now());
}

export function createAgents(deps: AgentsDeps) {
  return {
    requireUserVault: (userId: string | null) => requireUserVault(deps, userId),
    list: (vault: ActiveVault, token: string) => listAgents(deps, vault, token),
    get: (vault: ActiveVault, token: string, slug: string) => getAgent(deps, vault, token, slug),
    create: (userId: string, vault: ActiveVault, token: string, input: CreateAgentInput) =>
      createAgent(deps, userId, vault, token, input),
    update: (vault: ActiveVault, token: string, slug: string, input: UpdateAgentInput) =>
      updateAgent(deps, vault, token, slug, input),
    remove: (userId: string, vault: ActiveVault, token: string, slug: string) =>
      removeAgent(deps, userId, vault, token, slug),
  };
}
