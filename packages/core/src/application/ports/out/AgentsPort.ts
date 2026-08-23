import type { AgentChatConfig, AgentProfile } from "../../../domain/entities/agent";

/**
 * Outbound port for the agent-management REST surface. The agents use case
 * depends on this rather than the concrete `agents-api` transport, so the
 * backend call shape stays behind the composition root.
 */
export interface AgentsPort {
  listAgents(): Promise<{ agents: AgentProfile[] }>;
  createAgent(
    input: { name: string; email?: string; description?: string } & AgentChatConfig,
  ): Promise<{ agent: AgentProfile; token: string }>;
  updateAgent(
    slug: string,
    patch: { name?: string; email?: string; description?: string } & AgentChatConfig,
  ): Promise<{ agent: AgentProfile }>;
  deleteAgent(slug: string): Promise<{ ok: true }>;
}
