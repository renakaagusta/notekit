/**
 * Composition root for the shared vault-route helpers: binds the git-ops
 * resolver and the vault store to their driven adapters. The vault-shared
 * driving helper imports the wired functions from here so no driving code
 * reaches into a driven adapter.
 */
import { gitOpsResolver } from "../adapters/driven/vault/gitOpsResolver";
import { vaultStorePort } from "../adapters/driven/vault/vaultStorePort";

export const gitOps = gitOpsResolver.resolve;
export const resolveVault = vaultStorePort.getActiveVault;
