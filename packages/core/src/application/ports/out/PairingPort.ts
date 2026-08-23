import type { PairAnnouncement } from "../../../domain/entities/vault";

/**
 * Outbound port for the device-pairing relay (announce a new device, fetch a
 * pending announcement, clear it). The pairing use case depends on this rather
 * than the concrete `vault-api` transport, so the backend call shape stays
 * behind the composition root. Signatures mirror `vault-api` exactly so the
 * conformance const catches any drift.
 */
export interface PairingPort {
  announcePair(payload: {
    code: string;
    pubkey: string;
    deviceName: string;
    deviceId: string;
  }): Promise<{ ok: true; expiresAt: string }>;
  fetchPair(code: string): Promise<PairAnnouncement | null>;
  clearPair(code: string): Promise<{ ok: true }>;
}
