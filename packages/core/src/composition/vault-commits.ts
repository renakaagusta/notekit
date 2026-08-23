/**
 * Composition root for the vault-commits query. Binds the GetVaultCommits use
 * case to the concrete git vault adapter. Driving adapters import the wired
 * callable from here.
 */
import { vaultStoragePort } from "../adapters/driven/vault-api";
import { createGetVaultCommits } from "../application/usecases/getVaultCommits";

export const getVaultCommits = createGetVaultCommits(vaultStoragePort);
