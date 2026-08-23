import type { VaultManagementPort } from "../out/VaultManagementPort";

/**
 * Inbound port: the vault-management capability the UI drives (vaults, settings,
 * members, repo provisioning). Its shape mirrors the outbound
 * {@link VaultManagementPort} because these are pass-through operations today;
 * keeping a distinct inbound type marks the boundary the driving adapters depend
 * on.
 */
export type VaultManagementService = VaultManagementPort;
