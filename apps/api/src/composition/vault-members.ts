/**
 * Composition root for the vault-member routes: binds the vault store and
 * vault-token resolvers to their Drizzle-backed driven adapters. The driving
 * route imports the wired functions here so it never reaches into a driven
 * adapter for its store/token lookups.
 */
import { vaultStorePort } from "../adapters/driven/vault/vaultStorePort";
import { vaultTokenPort } from "../adapters/driven/vault/vaultTokenPort";

export const getVaultById = vaultStorePort.getVaultById;
export const getVaultToken = vaultTokenPort.getVaultToken;
