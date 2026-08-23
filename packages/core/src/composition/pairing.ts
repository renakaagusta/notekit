/**
 * Composition root for the pairing service. Binds the PairingService use case to
 * the concrete device-pairing relay adapter. Driving adapters import the wired
 * service.
 */
import { pairingPort } from "../adapters/driven/vault-api";
import { createPairingService } from "../application/usecases/pairingService";

export const pairingService = createPairingService(pairingPort);
