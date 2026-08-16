// MCP-side E2EE. The recovery phrase comes from the NOTEKIT_RECOVERY_PHRASE
// env var (the agent host sets env when launching the server), then we
// delegate to the shared, storage-agnostic helpers in @notekit/core/vault-e2ee.
// Without a phrase the server still works on plaintext vaults; encrypted vaults
// require it. See #49.

import {
  recoveryFromMnemonic,
  isValidMnemonic,
  serializeEncryptedLink,
  type RecoveryIdentity,
} from "@notekit/core/crypto";
import * as e2ee from "@notekit/core/vault-e2ee";
import type { NoteKitApi } from "@notekit/api-client";
import type { SavedLink } from "@notekit/core/types";

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
export async function decryptLink(path: string, content: string) {
  return e2ee.decryptLink(path, content, await requireVaultIdentity());
}
export async function encryptLink(link: SavedLink) {
  const identity = await requireVaultIdentity();
  const recipients = await e2ee.recipientsFor(identity);
  return serializeEncryptedLink(link, recipients);
}
export async function listEncryptedLinks(nk: NoteKitApi): Promise<SavedLink[]> {
  const identity = await requireVaultIdentity();
  const { entries } = await nk.vault.listFiles("links/");
  const out: SavedLink[] = [];
  for (const e of entries) {
    if (!e.path.endsWith(".md.age")) continue;
    const file = await nk.vault.readFile(e.path);
    if (!file.content) continue;
    const link = await e2ee.decryptLink(e.path, file.content, identity);
    if (link) out.push(link);
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}
