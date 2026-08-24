import type { AgentStorePort } from "../../../application/ports/out/AgentStorePort";
import {
  deleteAgentFile,
  listAgents,
  readAgent,
  writeAgent,
} from "./agentStore";

/** Git-vault implementation of {@link AgentStorePort}. */
export const agentStorePort: AgentStorePort = {
  readAgent,
  listAgents,
  writeAgent,
  deleteAgentFile,
};
