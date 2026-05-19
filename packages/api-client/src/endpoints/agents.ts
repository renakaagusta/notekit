// AI-agent profiles (system prompts, model picks). Mirrors
// apps/api/src/routes/agents.ts and packages/core/src/lib/agents-api.ts.

import type { NoteKitClient } from "../transport";
import type { AgentProfile } from "../types";

export function agentEndpoints(client: NoteKitClient) {
  return {
    async list(): Promise<{ agents: AgentProfile[] }> {
      return client.request("/agents");
    },
    async get(slug: string): Promise<{ agent: AgentProfile }> {
      return client.request(`/agents/${encodeURIComponent(slug)}`);
    },
    async create(input: {
      name: string;
      email?: string;
      description?: string;
      avatarUrl?: string | null;
    }): Promise<{ agent: AgentProfile; token: string }> {
      return client.request("/agents", { method: "POST", body: input });
    },
    async update(
      slug: string,
      patch: {
        name?: string;
        email?: string;
        description?: string;
        avatarUrl?: string | null;
      },
    ): Promise<{ agent: AgentProfile }> {
      return client.request(`/agents/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        body: patch,
      });
    },
    async remove(slug: string): Promise<{ ok: true }> {
      return client.request(`/agents/${encodeURIComponent(slug)}`, { method: "DELETE" });
    },
  };
}
