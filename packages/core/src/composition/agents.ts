/**
 * Composition root for the agents service. Binds the AgentsService use case to
 * the concrete agents REST adapter. Driving adapters import the wired service.
 */
import { agentsPort } from "../adapters/driven/agents-api";
import { createAgentsService } from "../application/usecases/agentsService";

export const agentsService = createAgentsService(agentsPort);
