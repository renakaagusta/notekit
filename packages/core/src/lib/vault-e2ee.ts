/**
 * Storage-agnostic E2EE helpers for non-browser clients (CLI, MCP). The age
 * identity is passed in — the caller decides where it comes from (the CLI's
 * OS keychain, the MCP server's env var). Vault file I/O goes through the
 * `NoteKitApi` client (the secrets backend must already be configured for the
 * recipient/config reads). See #49.
 */
import {
  serializeEncryptedNote,
  serializeEncryptedTicket,
  deserializeEncryptedNote,
  deserializeEncryptedTicket,
  deserializeEncryptedLink,
  isEncryptedItemPath,
  classifyEncryptedPath,
  type RecoveryIdentity,
  type DeviceIdentity,
} from "./crypto";
import { collectVaultRecipients, readVaultConfig } from "./secrets-vault";
import type { NoteKitApi } from "@notekit/api-client";
import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";
import type { SavedLink } from "../types/link";

export { isEncryptedItemPath as isEncrypted, classifyEncryptedPath };

/** Is the active vault born-E2EE? (`.notekit/config.json` says `required`.) */
export async function vaultIsEncrypted(): Promise<boolean> {
  try {
    return (await readVaultConfig()).encryption === "required";
  } catch {
    return false;
  }
}

/** Recipient set for the active vault, rooting the local client in `identity`. */
export async function recipientsFor(
  identity: RecoveryIdentity,
): Promise<string[]> {
  const device: DeviceIdentity = {
    deviceId: "headless",
    name: "notekit-headless",
    identity: identity.identity,
    recipient: identity.recipient,
    createdAt: new Date().toISOString(),
  };
  return collectVaultRecipients(device);
}

export async function encryptNote(
  note: Note,
  identity: RecoveryIdentity,
): Promise<string> {
  return serializeEncryptedNote(note, await recipientsFor(identity));
}

export async function encryptTicket(
  ticket: Ticket,
  identity: RecoveryIdentity,
): Promise<string> {
  return serializeEncryptedTicket(ticket, await recipientsFor(identity));
}

export function decryptNote(
  path: string,
  content: string,
  identity: RecoveryIdentity,
): Promise<Note | null> {
  return deserializeEncryptedNote(path, content, identity.identity);
}

export function decryptTicket(
  path: string,
  content: string,
  identity: RecoveryIdentity,
): Promise<Ticket | null> {
  return deserializeEncryptedTicket(path, content, identity.identity);
}

export function decryptLink(
  path: string,
  content: string,
  identity: RecoveryIdentity,
): Promise<SavedLink | null> {
  return deserializeEncryptedLink(path, content, identity.identity);
}

/** Scan + decrypt every note in an E2EE vault (no plaintext index). */
export async function listEncryptedNotes(
  nk: NoteKitApi,
  identity: RecoveryIdentity,
): Promise<Note[]> {
  const { entries } = await nk.vault.listFiles("notes/");
  const out: Note[] = [];
  for (const e of entries) {
    if (classifyEncryptedPath(e.path) !== "note") continue;
    const file = await nk.vault.readFile(e.path);
    if (!file.content) continue;
    const note = await decryptNote(e.path, file.content, identity);
    if (note) out.push(note);
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/** Scan + decrypt every ticket in an E2EE vault. */
export async function listEncryptedTickets(
  nk: NoteKitApi,
  identity: RecoveryIdentity,
): Promise<Ticket[]> {
  const { entries } = await nk.vault.listFiles("tickets/");
  const out: Ticket[] = [];
  for (const e of entries) {
    if (classifyEncryptedPath(e.path) !== "ticket") continue;
    const file = await nk.vault.readFile(e.path);
    if (!file.content) continue;
    const t = await decryptTicket(e.path, file.content, identity);
    if (t) out.push(t);
  }
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}
