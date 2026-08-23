import type { AgentsPort } from "../out/AgentsPort";

/**
 * Inbound port: the agent-management capability the UI drives (list, create,
 * update, delete agents). Its shape mirrors the outbound {@link AgentsPort}
 * because these are pass-through operations today; keeping a distinct inbound
 * type marks the boundary the driving adapters depend on.
 */
export type AgentsService = AgentsPort;
