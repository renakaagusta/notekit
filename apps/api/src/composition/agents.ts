/**
 * Composition root for the agent-profile CRUD use case: binds the use case to
 * the git-vault agent store, the vault-token resolver, and the Drizzle
 * agent-token repository. The driving route imports the wired functions here.
 */
import { agentTokenRepository } from "../adapters/driven/db/agentTokenRepository";
import { agentStorePort } from "../adapters/driven/vault/agentStorePort";
import { vaultTokenPort } from "../adapters/driven/vault/vaultTokenPort";
import { createAgents } from "../application/usecases/agents";

const agents = createAgents({
  store: agentStorePort,
  vaultToken: vaultTokenPort,
  tokens: agentTokenRepository,
});

export const requireAgentVault = agents.requireUserVault;
export const listAgentProfiles = agents.list;
export const getAgentProfile = agents.get;
export const createAgentProfile = agents.create;
export const updateAgentProfile = agents.update;
export const deleteAgentProfile = agents.remove;
