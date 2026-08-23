import type { PairingService } from "../ports/in/PairingService";
import type { PairingPort } from "../ports/out/PairingPort";

/**
 * Use case implementing {@link PairingService}: delegates each operation to the
 * injected {@link PairingPort}. The UI depends on this inbound capability, which
 * depends only on the outbound port — the pairing transport is swappable.
 */
export function createPairingService(pairing: PairingPort): PairingService {
  return {
    announcePair: (payload) => pairing.announcePair(payload),
    fetchPair: (code) => pairing.fetchPair(code),
    clearPair: (code) => pairing.clearPair(code),
  };
}
