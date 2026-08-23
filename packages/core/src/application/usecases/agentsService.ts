import type { AgentsService } from "../ports/in/AgentsService";
import type { AgentsPort } from "../ports/out/AgentsPort";

/**
 * Use case implementing {@link AgentsService}: delegates each operation to the
 * injected {@link AgentsPort}. The UI depends on this inbound capability, which
 * depends only on the outbound port — the agents transport is swappable.
 */
export function createAgentsService(agents: AgentsPort): AgentsService {
  return {
    listAgents: () => agents.listAgents(),
    createAgent: (input) => agents.createAgent(input),
    updateAgent: (slug, patch) => agents.updateAgent(slug, patch),
    deleteAgent: (slug) => agents.deleteAgent(slug),
  };
}
