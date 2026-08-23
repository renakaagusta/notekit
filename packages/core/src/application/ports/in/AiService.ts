import type { AiPort } from "../out/AiPort";

/**
 * Inbound port: the "ask the configured AI provider" capability the AI panel
 * drives. Mirrors the outbound {@link AiPort} (pass-through today); the distinct
 * type marks the boundary the driving adapter depends on.
 */
export type AiService = AiPort;
