/**
 * Storage-agnostic E2EE helpers for non-browser clients (CLI, MCP). The age
 * identity is passed in — the caller decides where it comes from (the CLI's
 * OS keychain, the MCP server's env var). Vault file I/O goes through the
 * `NoteKitApi` client (the secrets backend must already be configured for the
 * recipient/config reads). See #49.
 */
import type { NoteKitApi } from "@notekit/api-client";
import type { SavedLink } from "../domain/entities/link";
import type { Note } from "../domain/entities/note";
import type { Ticket } from "../domain/entities/ticket";
import { mapWithConcurrency } from "./concurrency";
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
import {
  collectVaultRecipients,
  readVaultConfig,
  reencryptImportedItems,
} from "./secrets-vault";
import type { VaultCiphertextCache } from "./vault-ciphertext-cache";

export { isEncryptedItemPath as isEncrypted, classifyEncryptedPath };
export type { VaultCiphertextCache } from "./vault-ciphertext-cache";

/**
 * How many ciphertext files to fetch at once when scanning a vault. An E2EE
 * vault has no plaintext index, so a listing reads every file — done serially
 * over the network that is unusably slow. Bounded so we don't hammer the
 * git backend (our own Forgejo) with an unbounded burst.
 */
const VAULT_READ_CONCURRENCY = 8;

/**
 * Fetch a file's ciphertext, serving it from the content-addressed cache when
 * the blob sha is already known (zero network) and warming the cache on a miss.
 * Without a cache this is just a `readFile`.
 */
async function readCiphertext(
  nk: NoteKitApi,
  entry: { path: string; sha: string },
  cache: VaultCiphertextCache | undefined,
): Promise<string | undefined> {
  if (cache) {
    const hit = await cache.get(entry.sha);
    if (hit !== undefined) return hit;
  }
  const file = await nk.vault.readFile(entry.path);
  const content = file.content ?? undefined;
  if (cache && content !== undefined) await cache.put(entry.sha, content);
  return content;
}

/**
 * Finish a cross-vault migration: re-seal every item that was byte-copied from
 * another vault (still encrypted to the SOURCE vault) to the ACTIVE vault's
 * recipients, in ONE batched commit. Must run on a device that is a recipient
 * of the source vault, so it can decrypt; items it can't open are skipped and
 * reported. Idempotent — safe to re-run until `skipped` reaches 0.
 */
export async function finishVaultImport(
  device: DeviceIdentity,
): Promise<{ resealed: number; skipped: number }> {
  const recipients = await collectVaultRecipients(device);
  return reencryptImportedItems(
    device,
    recipients,
    (kind, id) => `Re-encrypt imported ${kind} ${id}`,
  );
}

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
  cache?: VaultCiphertextCache,
): Promise<Note[]> {
  const { entries } = await nk.vault.listFiles("notes/");
  const targets = entries.filter((e) => classifyEncryptedPath(e.path) === "note");
  const decrypted = await mapWithConcurrency(targets, VAULT_READ_CONCURRENCY, async (e) => {
    const content = await readCiphertext(nk, e, cache);
    if (!content) return null;
    try {
      return await decryptNote(e.path, content, identity);
    } catch {
      // A note sealed to a recipient set this identity isn't in (e.g. an
      // orphan from a migration) shouldn't fail the whole listing — skip it,
      // mirroring the app, which shows readable items and flags the rest.
      return null;
    }
  });
  const out = decrypted.filter((note): note is Note => note !== null);
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}

/** Scan + decrypt every ticket in an E2EE vault. */
export async function listEncryptedTickets(
  nk: NoteKitApi,
  identity: RecoveryIdentity,
  cache?: VaultCiphertextCache,
): Promise<Ticket[]> {
  const { entries } = await nk.vault.listFiles("tickets/");
  const targets = entries.filter((e) => classifyEncryptedPath(e.path) === "ticket");
  const decrypted = await mapWithConcurrency(targets, VAULT_READ_CONCURRENCY, async (e) => {
    const content = await readCiphertext(nk, e, cache);
    if (!content) return null;
    try {
      return await decryptTicket(e.path, content, identity);
    } catch {
      // Skip an item this identity can't open (see listEncryptedNotes).
      return null;
    }
  });
  const out = decrypted.filter((t): t is Ticket => t !== null);
  out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return out;
}
