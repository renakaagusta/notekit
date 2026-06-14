// CLI-side E2EE: derive the vault identity from the recovery phrase in the OS
// keychain and decrypt/encrypt items, reusing the Node-safe crypto from
// @notekit/core/crypto. The recovery key is a recipient on every encrypted
// item, so it alone can read (and write to) an E2EE vault — no device key or
// IndexedDB needed. See #49.

import {
  recoveryFromMnemonic,
  isValidMnemonic,
  isEncryptedItemPath,
  classifyEncryptedPath,
  deserializeEncryptedNote,
  deserializeEncryptedTicket,
  deserializeEncryptedLink,
  type RecoveryIdentity,
} from "@notekit/core/crypto";
import type { Note } from "@notekit/core/types";
import type { Ticket } from "@notekit/core/types";
import type { SavedLink } from "@notekit/core/types";
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

/** Resolve the vault age identity from the stored recovery phrase, or null. */
export async function tryVaultIdentity(): Promise<RecoveryIdentity | null> {
  if (cached) return cached;
  const phrase = await getRecoveryPhrase();
  if (!phrase || !isValidMnemonic(phrase)) return null;
  cached = await recoveryFromMnemonic(phrase);
  return cached;
}

/** Like {@link tryVaultIdentity} but throws {@link VaultLockedError} if locked. */
export async function requireVaultIdentity(): Promise<RecoveryIdentity> {
  const id = await tryVaultIdentity();
  if (!id) throw new VaultLockedError();
  return id;
}

export function isEncrypted(path: string): boolean {
  return isEncryptedItemPath(path);
}

/**
 * Decrypt an encrypted item file into its typed record. Returns null if the
 * path/content isn't an encrypted item of the expected kind.
 */
export async function decryptNote(
  path: string,
  content: string,
): Promise<Note | null> {
  const id = await requireVaultIdentity();
  return deserializeEncryptedNote(path, content, id.identity);
}

export async function decryptTicket(
  path: string,
  content: string,
): Promise<Ticket | null> {
  const id = await requireVaultIdentity();
  return deserializeEncryptedTicket(path, content, id.identity);
}

export async function decryptLink(
  path: string,
  content: string,
): Promise<SavedLink | null> {
  const id = await requireVaultIdentity();
  return deserializeEncryptedLink(path, content, id.identity);
}

export { classifyEncryptedPath };
