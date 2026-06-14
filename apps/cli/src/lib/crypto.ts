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
  serializeEncryptedNote,
  serializeEncryptedTicket,
  type RecoveryIdentity,
  type DeviceIdentity,
} from "@notekit/core/crypto";
import {
  collectVaultRecipients,
  readVaultConfig,
} from "@notekit/core/secrets";
import type { NoteKitApi } from "@notekit/api-client";
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

/**
 * Is the active vault born-E2EE? Reads `.notekit/config.json` via the
 * configured secrets backend — caller must have run `getSecretsClient()`.
 */
export async function vaultIsEncrypted(): Promise<boolean> {
  try {
    const config = await readVaultConfig();
    return config.encryption === "required";
  } catch {
    return false;
  }
}

/**
 * Seal a note into the `.md.age` envelope for the whole vault audience
 * (every registered device + the recovery key). The CLI acts as a device
 * rooted in the recovery identity — `collectVaultRecipients` adds it plus
 * the existing devices and the recovery recipient.
 */
export async function encryptNote(note: Note): Promise<string> {
  return serializeEncryptedNote(note, await vaultRecipients());
}

/** Recipient set for the active vault, with the CLI rooted in the recovery key. */
async function vaultRecipients(): Promise<string[]> {
  const id = await requireVaultIdentity();
  const device: DeviceIdentity = {
    deviceId: "cli",
    name: "notekit-cli",
    identity: id.identity,
    recipient: id.recipient,
    createdAt: new Date().toISOString(),
  };
  return collectVaultRecipients(device);
}

export async function encryptTicket(ticket: Ticket): Promise<string> {
  return serializeEncryptedTicket(ticket, await vaultRecipients());
}

/** List tickets in an E2EE vault by scanning + decrypting (no plaintext index). */
export async function listEncryptedTickets(nk: NoteKitApi): Promise<Ticket[]> {
  const { entries } = await nk.vault.listFiles("tickets/");
  const out: Ticket[] = [];
  for (const e of entries) {
    if (classifyEncryptedPath(e.path) !== "ticket") continue;
    const file = await nk.vault.readFile(e.path);
    if (!file.content) continue;
    const t = await decryptTicket(e.path, file.content);
    if (t) out.push(t);
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

export interface EncryptedNoteMeta {
  id: string;
  title: string;
  body: string;
  path: string;
  updatedAt: string;
}

/**
 * List notes in an E2EE vault by scanning `notes/` and decrypting each item
 * (the web does the same — there's no plaintext index that could leak titles).
 */
export async function listEncryptedNotes(
  nk: NoteKitApi,
): Promise<EncryptedNoteMeta[]> {
  const { entries } = await nk.vault.listFiles("notes/");
  const out: EncryptedNoteMeta[] = [];
  for (const e of entries) {
    if (classifyEncryptedPath(e.path) !== "note") continue;
    const file = await nk.vault.readFile(e.path);
    if (!file.content) continue;
    const note = await decryptNote(e.path, file.content);
    if (note) {
      out.push({
        id: note.id,
        title: note.title,
        body: note.body,
        path: e.path,
        updatedAt: note.updatedAt,
      });
    }
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}
