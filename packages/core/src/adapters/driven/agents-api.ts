import type { AgentsPort } from "../../application/ports/out/AgentsPort";
import {
  type AgentProfile,
  type AgentChatConfig,
  type AgentToolPermissions,
  type AgentProvider,
  agentKeySecretName,
  DEFAULT_AGENT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
} from "../../domain/entities/agent";
import { apiFetch } from "./api";

// Re-export types for backward compatibility
export type { AgentProfile, AgentChatConfig, AgentToolPermissions, AgentProvider };
export { agentKeySecretName, DEFAULT_AGENT_MODEL, DEFAULT_SYSTEM_PROMPT };

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

/**
 * {@link AgentsPort} conformance for this driven adapter.
 */
export const agentsPort: AgentsPort = {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
};
