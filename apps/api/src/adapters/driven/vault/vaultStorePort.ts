import type {
  ActiveVaultRow,
  VaultStorePort,
} from "../../../application/ports/out/VaultStorePort";
import { getActiveVault } from "./store";

/** Drizzle-backed implementation of {@link VaultStorePort}. */
export const vaultStorePort: VaultStorePort = {
  async getActiveVault(userId: string): Promise<ActiveVaultRow | null> {
    const active = await getActiveVault(userId);
    if (!active) return null;
    return {
      id: active.id,
      owner: active.owner,
      repo: active.repo,
      branch: active.branch,
      provider: active.provider,
    };
  },
};
