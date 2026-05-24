import { apiFetch } from "./api";

export interface AgentProfile {
  slug: string;
  name: string;
  /** Drives the agent's Gravatar lookup — register this email at
   *  https://gravatar.com to give the agent a profile picture. */
  email: string;
  description: string;
  createdAt: string;
}

export function listAgents(): Promise<{ agents: AgentProfile[] }> {
  return apiFetch("/agents");
}

export function createAgent(input: {
  name: string;
  email?: string;
  description?: string;
}): Promise<{ agent: AgentProfile; token: string }> {
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
  },
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
