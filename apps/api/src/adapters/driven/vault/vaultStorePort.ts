import type {
  ActiveVaultRow,
  VaultStorePort,
} from "../../../application/ports/out/VaultStorePort";
import {
  createVault,
  deleteVault,
  getActiveVault,
  getVaultById,
  getVaultSettings,
  listVaultsForUser,
  renameVault,
  setActiveVault,
  updateVaultSettings,
} from "./store";
import type { VaultRow } from "./store";

function toActiveVaultRow(row: VaultRow): ActiveVaultRow {
  return {
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    provider: row.provider,
  };
}

/** Drizzle-backed implementation of {@link VaultStorePort}. */
export const vaultStorePort: VaultStorePort = {
  async getActiveVault(userId: string): Promise<ActiveVaultRow | null> {
    const active = await getActiveVault(userId);
    return active ? toActiveVaultRow(active) : null;
  },
  async getVaultById(userId: string, vaultId: string): Promise<ActiveVaultRow | null> {
    const row = await getVaultById(userId, vaultId);
    return row ? toActiveVaultRow(row) : null;
  },
  getActiveVaultRow: getActiveVault,
  getVaultRowById: getVaultById,
  listVaultsForUser,
  createVault,
  renameVault,
  deleteVault,
  setActiveVault,
  getVaultSettings,
  updateVaultSettings,
};
