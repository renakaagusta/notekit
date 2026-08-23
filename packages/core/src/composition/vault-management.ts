/**
 * Composition root for the vault-management service. Binds the
 * VaultManagementService use case to the concrete vault-management REST adapter.
 * Driving adapters import the wired service.
 */
import { vaultManagementPort } from "../adapters/driven/vault-api";
import { createVaultManagementService } from "../application/usecases/vaultManagementService";

export const vaultManagement = createVaultManagementService(vaultManagementPort);
