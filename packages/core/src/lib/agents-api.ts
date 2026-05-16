import { apiFetch } from "./api";

export interface AgentProfile {
  slug: string;
  name: string;
  email: string;
  description: string;
  avatarUrl: string | null;
  createdAt: string;
}

export function listAgents(): Promise<{ agents: AgentProfile[] }> {
  return apiFetch("/agents");
}

export function createAgent(input: {
  name: string;
  email?: string;
  description?: string;
  avatarUrl?: string | null;
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
    avatarUrl?: string | null;
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
