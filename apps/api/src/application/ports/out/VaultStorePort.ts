import type { GitProvider } from "../../../domain/git-provider";

/**
 * The subset of a stored vault row the vault-shared helpers read when resolving
 * the user's active vault. Mirrors the driven vault store's `VaultRow` fields
 * that `resolveVault` projects — id, owner, repo, branch, provider.
 */
export interface ActiveVaultRow {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  provider: GitProvider;
}

/**
 * A full stored vault row. Mirrors the driven vault store's `VaultRow`; the
 * vault CRUD routes read every field (including `label`) so this is the shape
 * the store methods below return.
 */
export interface VaultRow {
  id: string;
  userId: string;
  provider: GitProvider;
  owner: string;
  repo: string;
  branch: string;
  label: string | null;
  createdAt: number;
}

export interface CreateVaultInput {
  userId: string;
  provider: GitProvider;
  owner: string;
  repo: string;
  branch?: string;
  label?: string;
}

export interface VaultSettingsValue {
  theme: "auto" | "light" | "dark";
  defaultFolder: string | null;
  defaultAgentSlug: string | null;
}

/**
 * Outbound port for reading and mutating the user's vaults plus per-vault
 * settings. The vault-shared driving helpers and the vault CRUD routes depend
 * on this instead of the concrete `vault/store` adapter.
 */
export interface VaultStorePort {
  getActiveVault(userId: string): Promise<ActiveVaultRow | null>;
  getVaultById(userId: string, vaultId: string): Promise<ActiveVaultRow | null>;
  getActiveVaultRow(userId: string): Promise<VaultRow | null>;
  getVaultRowById(userId: string, vaultId: string): Promise<VaultRow | null>;
  listVaultsForUser(userId: string): Promise<VaultRow[]>;
  createVault(input: CreateVaultInput): Promise<VaultRow>;
  renameVault(
    userId: string,
    vaultId: string,
    patch: { label?: string | null; branch?: string },
  ): Promise<VaultRow | null>;
  deleteVault(
    userId: string,
    vaultId: string,
  ): Promise<{ deleted: boolean; newActiveId: string | null }>;
  setActiveVault(userId: string, vaultId: string): Promise<VaultRow | null>;
  getVaultSettings(vaultId: string): Promise<VaultSettingsValue>;
  updateVaultSettings(
    vaultId: string,
    patch: Partial<VaultSettingsValue>,
  ): Promise<VaultSettingsValue>;
}
