/**
 * Outbound port for the authenticated REST client.
 *
 * Application/service code that needs to talk to the NoteKit backend depends on
 * this callable contract rather than importing the concrete `fetch` wrapper, so
 * the transport (base URL, auth headers, error mapping) stays in a driven
 * adapter and the composition root injects it.
 */
export type ApiFetchPort = <T>(path: string, init?: RequestInit) => Promise<T>;
