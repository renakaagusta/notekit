import type { GetVaultCommits } from "../ports/in/GetVaultCommits";
import type { VaultPort } from "../ports/out/VaultPort";

/**
 * Use case implementing {@link GetVaultCommits}: delegates to the injected
 * {@link VaultPort}. Thin by design — the value is the dependency direction:
 * the UI depends on this inbound port, and this depends only on the outbound
 * port, so the git transport is swappable without touching either.
 */
export function createGetVaultCommits(vault: VaultPort): GetVaultCommits {
  return (path, limit) => vault.listCommits(path, limit);
}
