import { apiFetch } from "./api";

/** Read-only agents cannot run create/edit/delete tools from the assistant. */
export type AgentToolPermissions = "read-only" | "read-write";

/** Default Anthropic model when a profile doesn't pin one. */
export const DEFAULT_AGENT_MODEL = "claude-3-5-haiku-latest";

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
  /** Anthropic model the in-app assistant uses for this profile. */
  model?: string;
  /** Persona / instructions injected as the chat system prompt. */
  systemPrompt?: string;
  /** Whether this profile may mutate the vault. Defaults to read-only. */
  toolPermissions?: AgentToolPermissions;
}

/** Editable chat-persona fields, shared by create and update inputs. */
export interface AgentChatConfig {
  emoji?: string;
  model?: string;
  systemPrompt?: string;
  toolPermissions?: AgentToolPermissions;
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
