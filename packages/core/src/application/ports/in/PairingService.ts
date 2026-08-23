import type { PairingPort } from "../out/PairingPort";

/**
 * Inbound port: the device-pairing capability the UI drives (announce, fetch,
 * clear). Its shape mirrors the outbound {@link PairingPort} because these are
 * pass-through operations today; keeping a distinct inbound type marks the
 * boundary the driving adapters depend on.
 */
export type PairingService = PairingPort;
