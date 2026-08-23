/**
 * Composition root for the vault event stream. Binds the VaultEventStream use
 * case to the concrete SSE adapter. Driving adapters import the wired stream.
 */
import { vaultEventsNotifierPort } from "../adapters/driven/vault-events-client";
import { createVaultEventStream } from "../application/usecases/vaultEventStream";

export const vaultEventStream = createVaultEventStream(vaultEventsNotifierPort);
