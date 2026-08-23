import type { NotifierPort } from "../out/NotifierPort";

/**
 * Inbound port: start/stop the live vault event stream (SSE). The UI drives this
 * capability; the use case behind it delegates to the outbound {@link NotifierPort}
 * so components never touch the EventSource transport directly.
 */
export type VaultEventStream = NotifierPort;
