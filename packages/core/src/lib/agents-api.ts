import { apiFetch } from "./api";

/** Read-only agents cannot run create/edit/delete tools from the assistant. */
export type AgentToolPermissions = "read-only" | "read-write";
/** Which API a profile talks to: Anthropic direct, or an OpenAI-compatible endpoint. */
export type AgentProvider = "anthropic" | "openai-compatible";

/** Default Anthropic model when a profile doesn't pin one. */
export const DEFAULT_AGENT_MODEL = "claude-3-5-haiku-latest";

/** Default persona used to pre-fill new profiles and as a chat fallback. */
export const DEFAULT_SYSTEM_PROMPT =
  "Kamu adalah asisten AI di dalam NoteKit, aplikasi catatan lokal-first. " +
  "Jawab ringkas, jelas, dan membantu. Bila diberi konteks catatan, gunakan itu " +
  "sebagai rujukan. Gunakan bahasa yang sama dengan pengguna. Gunakan Markdown " +
  "untuk memformat jawaban bila membantu.";

/**
 * Vault secret name that holds a profile's API key. Keys live in the E2EE
 * secrets vault (encrypted) — never in the profile's plaintext JSON — keyed
 * per profile so each agent is self-contained.
 */
export function agentKeySecretName(slug: string): string {
  return `agentkey-${slug}`;
}

export interface AgentProfile {
  slug: string;
  name: string;
  /** Drives the agent's Gravatar lookup — register this email at
   *  https://gravatar.com to give the agent a profile picture. */
  email: string;
  description: string;
  createdAt: string;
  /** Emoji shown in the assistant's profile picker (git avatar stays Gravatar). */
  emoji?: string;
  /** Model id the in-app assistant uses for this profile. */
  model?: string;
  /** Persona / instructions injected as the chat system prompt. */
  systemPrompt?: string;
  /** Whether this profile may mutate the vault. Defaults to read-only. */
  toolPermissions?: AgentToolPermissions;
  /** API family. Defaults to anthropic. */
  provider?: AgentProvider;
  /** Base URL for openai-compatible providers (e.g. a self-hosted router). */
  baseUrl?: string;
}

/** Editable chat-persona fields, shared by create and update inputs. */
export interface AgentChatConfig {
  emoji?: string;
  model?: string;
  systemPrompt?: string;
  toolPermissions?: AgentToolPermissions;
  provider?: AgentProvider;
  baseUrl?: string;
}

export function listAgents(): Promise<{ agents: AgentProfile[] }> {
  return apiFetch("/agents");
}

export function createAgent(input: {
  name: string;
  email?: string;
  description?: string;
} & AgentChatConfig): Promise<{ agent: AgentProfile; token: string }> {
  return apiFetch("/agents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAgent(
  slug: string,
  patch: {
    name?: string;
    email?: string;
    description?: string;
  } & AgentChatConfig,
): Promise<{ agent: AgentProfile }> {
  return apiFetch(`/agents/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteAgent(slug: string): Promise<{ ok: true }> {
  return apiFetch(`/agents/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });
}
