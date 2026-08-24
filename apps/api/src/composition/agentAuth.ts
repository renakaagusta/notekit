/**
 * Composition root for agent-token auth: binds the agent-auth functions to the
 * Drizzle repository, then re-exports them. Importers pull the agent-auth
 * functions from here so the port is wired before first use.
 */
import { agentAuthRepository } from "../adapters/driven/auth/agentAuthRepository";
import { configureAgentAuth } from "../adapters/driving/auth/agentAuth";

configureAgentAuth(agentAuthRepository);

export * from "../adapters/driving/auth/agentAuth";
