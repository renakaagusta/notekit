/**
 * Composition root for the core vault CRUD + file/SSE/import routes: binds the
 * vault store, the vault-token resolver, and the agent store to their driven
 * adapters. The driving route imports the wired functions here so it never
 * reaches into a driven adapter for its store/token/agent lookups.
 */
import { agentStorePort } from "../adapters/driven/vault/agentStorePort";
import { vaultStorePort } from "../adapters/driven/vault/vaultStorePort";
import { vaultTokenPort } from "../adapters/driven/vault/vaultTokenPort";

export const listVaultsForUser = vaultStorePort.listVaultsForUser;
export const getActiveVault = vaultStorePort.getActiveVaultRow;
export const getVaultById = vaultStorePort.getVaultRowById;
export const createVault = vaultStorePort.createVault;
export const renameVault = vaultStorePort.renameVault;
export const deleteVault = vaultStorePort.deleteVault;
export const setActiveVault = vaultStorePort.setActiveVault;
export const getVaultSettings = vaultStorePort.getVaultSettings;
export const updateVaultSettings = vaultStorePort.updateVaultSettings;

export const getVaultToken = vaultTokenPort.getVaultToken;

export const readAgent = agentStorePort.readAgent;
