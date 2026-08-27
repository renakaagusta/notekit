// CLI E2EE: load the vault identity from the recovery phrase in the OS keychain
// and delegate the actual encrypt/decrypt to the shared, storage-agnostic
// helpers in @notekit/core/vault-e2ee. See #49.

import type { NoteKitApi } from "@notekit/api-client";
import {
  recoveryFromMnemonic,
  isValidMnemonic,
  type RecoveryIdentity,
  type DeviceIdentity,
} from "@notekit/core/crypto";
import type { Note, Ticket  } from "@notekit/core/types";
import * as e2ee from "@notekit/core/vault-e2ee";
import { getRecoveryPhrase, getDeviceIdentity } from "../adapters/driven/keychain.js";
import { diskCiphertextCache } from "../adapters/driven/vault-cache.js";

/** Thrown when an encrypted item is hit but no recovery phrase is unlocked. */
export class VaultLockedError extends Error {
  constructor() {
    super(
      "This vault is end-to-end encrypted. Run `notekit vault pair` to link this CLI, or `notekit vault unlock` to provide your 24-word recovery phrase.",
    );
    this.name = "VaultLockedError";
  }
}

let cached: RecoveryIdentity | null = null;

export async function tryVaultIdentity(): Promise<RecoveryIdentity | null> {
  // Prefer the real device identity set up via `notekit vault pair`.
  const device = await getDeviceIdentity();
  if (device) return { identity: device.identity, recipient: device.recipient };
  // Fall back to the recovery phrase stored by `notekit vault unlock`.
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

/** DeviceIdentity for secrets-vault operations. Uses the paired device if available. */
export async function vaultDevice(): Promise<DeviceIdentity> {
  const device = await getDeviceIdentity();
  if (device) return device;
  const id = await requireVaultIdentity();
  return {
    deviceId: "cli",
    name: "notekit-cli",
    identity: id.identity,
    recipient: id.recipient,
    createdAt: new Date().toISOString(),
  };
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
  return e2ee.listEncryptedNotes(nk, await requireVaultIdentity(), diskCiphertextCache());
}
export async function listEncryptedTickets(nk: NoteKitApi): Promise<Ticket[]> {
  return e2ee.listEncryptedTickets(nk, await requireVaultIdentity(), diskCiphertextCache());
}
