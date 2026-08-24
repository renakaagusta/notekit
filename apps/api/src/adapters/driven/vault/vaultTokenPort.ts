import type { VaultTokenPort } from "../../../application/ports/out/VaultTokenPort";
import { getActiveVaultToken, getVaultToken } from "./tokens";

/** Drizzle-backed implementation of {@link VaultTokenPort}. */
export const vaultTokenPort: VaultTokenPort = {
  getActiveVaultToken,
  getVaultToken,
};
