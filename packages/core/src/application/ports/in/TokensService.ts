import type { TokensPort } from "../out/TokensPort";

/**
 * Inbound port: the personal-access-token capability the UI drives (list, mint,
 * revoke). Its shape mirrors the outbound {@link TokensPort} because these are
 * pass-through operations today; keeping a distinct inbound type marks the
 * boundary the driving adapters depend on.
 */
export type TokensService = TokensPort;
