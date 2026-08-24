/**
 * Domain types for agent notification events. Pure: no external dependencies.
 */
export type AgentEventType = "file.write" | "file.delete" | "device.paired";

export interface AgentEventInput {
  userId: string;
  agentSlug: string;
  eventType: AgentEventType;
  resourcePath: string;
  extra?: Record<string, unknown>;
}
