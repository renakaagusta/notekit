// CLI E2EE: load the vault identity from the recovery phrase in the OS keychain
// and delegate the actual encrypt/decrypt to the shared, storage-agnostic
// helpers in @notekit/core/vault-e2ee. See #49.

import {
  recoveryFromMnemonic,
  isValidMnemonic,
  type RecoveryIdentity,
} from "@notekit/core/crypto";
import * as e2ee from "@notekit/core/vault-e2ee";
import type { NoteKitApi } from "@notekit/api-client";
import type { Note } from "@notekit/core/types";
import type { Ticket } from "@notekit/core/types";
import { getRecoveryPhrase } from "../keychain.js";

/** Thrown when an encrypted item is hit but no recovery phrase is unlocked. */
export class VaultLockedError extends Error {
  constructor() {
    super(
      "This vault is end-to-end encrypted and this CLI is locked. Run `notekit vault unlock` (paste your 24-word recovery phrase) first.",
    );
    this.name = "VaultLockedError";
  }
}

let cached: RecoveryIdentity | null = null;

export async function tryVaultIdentity(): Promise<RecoveryIdentity | null> {
  if (cached) return cached;
  const phrase = await getRecoveryPhrase();
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
export const classifyEncryptedPath = e2ee.classifyEncryptedPath;
export const vaultIsEncrypted = e2ee.vaultIsEncrypted;

export async function decryptNote(path: string, content: string): Promise<Note | null> {
  return e2ee.decryptNote(path, content, await requireVaultIdentity());
}
export async function decryptTicket(path: string, content: string): Promise<Ticket | null> {
  return e2ee.decryptTicket(path, content, await requireVaultIdentity());
}
export async function encryptNote(note: Note): Promise<string> {
  return e2ee.encryptNote(note, await requireVaultIdentity());
}
export async function encryptTicket(ticket: Ticket): Promise<string> {
  return e2ee.encryptTicket(ticket, await requireVaultIdentity());
}
export async function listEncryptedNotes(nk: NoteKitApi): Promise<Note[]> {
  return e2ee.listEncryptedNotes(nk, await requireVaultIdentity());
}
export async function listEncryptedTickets(nk: NoteKitApi): Promise<Ticket[]> {
  return e2ee.listEncryptedTickets(nk, await requireVaultIdentity());
}
