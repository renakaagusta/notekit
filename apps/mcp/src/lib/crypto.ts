// MCP-side E2EE. The recovery phrase comes from the NOTEKIT_RECOVERY_PHRASE
// env var (the agent host sets env when launching the server), then we
// delegate to the shared, storage-agnostic helpers in @notekit/core/vault-e2ee.
// Without a phrase the server still works on plaintext vaults; encrypted vaults
// require it. See #49.

import {
  recoveryFromMnemonic,
  isValidMnemonic,
  type RecoveryIdentity,
} from "@notekit/core/crypto";
import * as e2ee from "@notekit/core/vault-e2ee";

export class VaultLockedError extends Error {
  constructor() {
    super(
      "This vault is end-to-end encrypted but no recovery phrase is available. Set NOTEKIT_RECOVERY_PHRASE (the vault's 24-word phrase) in the MCP server's environment.",
    );
    this.name = "VaultLockedError";
  }
}

let cached: RecoveryIdentity | null = null;

export async function tryVaultIdentity(): Promise<RecoveryIdentity | null> {
  if (cached) return cached;
  const phrase = process.env["NOTEKIT_RECOVERY_PHRASE"]?.trim();
  if (!phrase || !isValidMnemonic(phrase)) return null;
  cached = await recoveryFromMnemonic(phrase);
  return cached;
}

export async function requireVaultIdentity(): Promise<RecoveryIdentity> {
  const id = await tryVaultIdentity();
  if (!id) throw new VaultLockedError();
  return id;
}

export const isEncrypted = e2ee.isEncrypted;
export const vaultIsEncrypted = e2ee.vaultIsEncrypted;

export async function decryptNote(path: string, content: string) {
  return e2ee.decryptNote(path, content, await requireVaultIdentity());
}
export async function decryptTicket(path: string, content: string) {
  return e2ee.decryptTicket(path, content, await requireVaultIdentity());
}
export async function encryptNote(note: Parameters<typeof e2ee.encryptNote>[0]) {
  return e2ee.encryptNote(note, await requireVaultIdentity());
}
export async function encryptTicket(
  ticket: Parameters<typeof e2ee.encryptTicket>[0],
) {
  return e2ee.encryptTicket(ticket, await requireVaultIdentity());
}
export async function listEncryptedNotes(
  nk: Parameters<typeof e2ee.listEncryptedNotes>[0],
) {
  return e2ee.listEncryptedNotes(nk, await requireVaultIdentity());
}
export async function listEncryptedTickets(
  nk: Parameters<typeof e2ee.listEncryptedTickets>[0],
) {
  return e2ee.listEncryptedTickets(nk, await requireVaultIdentity());
}
