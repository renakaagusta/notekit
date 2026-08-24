import type {
  AgentProfile,
  DeleteAgentFileOpts,
  ReadAgentOpts,
  WriteAgentOpts,
} from "../../../domain/agents";
import type { GitProvider } from "../../../domain/git-provider";

/**
 * Outbound port for agent-profile file I/O in the user's git vault. The agents
 * use case depends on this instead of the concrete `vault/agentStore` adapter,
 * so the git-file operations live in a driven adapter and the use case can be
 * exercised with an in-memory fake.
 */
export interface AgentStorePort {
  readAgent(opts: ReadAgentOpts): Promise<{ profile: AgentProfile; sha: string } | null>;
  listAgents(
    provider: GitProvider,
    token: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<AgentProfile[]>;
  writeAgent(opts: WriteAgentOpts): Promise<{ sha: string }>;
  deleteAgentFile(opts: DeleteAgentFileOpts): Promise<void>;
}
