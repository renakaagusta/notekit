/**
 * Composition root for the vault sync orchestrator.
 *
 * This is the ONE place the sync application module is bound to its concrete
 * driven adapters (git transport + local ciphertext cache). Wiring happens
 * eagerly at import — exactly when the old module-level default did — so the
 * app's behavior is identical; only the dependency direction is now clean
 * (sync/ depends on ports, the composition root injects the adapters).
 */
import { vaultStoragePort } from "../adapters/driven/vault-api";
import { vaultCacheStoragePort } from "../adapters/driven/vault-cache";
import { createVaultSync } from "../lib/sync";

export const { start, refresh, pull, reset } = createVaultSync({
  vault: vaultStoragePort,
  cache: vaultCacheStoragePort,
});
