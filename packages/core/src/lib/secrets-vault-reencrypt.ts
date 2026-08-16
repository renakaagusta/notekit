/**
 * Re-encryption helpers: re-seal secrets, items, and chats to an updated
 * recipient set. Used after device add/remove, member add/remove, and key
 * rotation. Also contains the vault-key rotation and the
 * reEncryptVaultIfMembersChanged bootstrap path.
 *
 * Imports from secrets-vault-core and secrets-vault-sharing; re-exported from
 * secrets-vault.ts for external callers.
 */
import type { DeviceIdentity } from "./crypto/device-key";
import {
  classifyEncryptedPath,
  encryptItemPayload,
  parseEncryptedEnvelope,
  decryptItemPayload,
  type EncryptedItemKind,
} from "./crypto/item-crypto";
import { generateVaultKey, type VaultKey } from "./crypto/keybox";
import type { RecoverySigningKey } from "./crypto/recovery";
import {
  encryptSecrets,
  decryptSecrets,
} from "./crypto/vault-crypto";
import {
  backend,
  shaCache,
  contentIdentity,
  collectVaultRecipients,
  parseSecretPath,
  SECRETS_PREFIX,
  commitMany,
  keyboxExists,
  writeKeybox,
  readKeyboxEpoch,
  setActiveVaultKey,
  getActiveVaultKey,
  recipientSignature,
  type BatchFile,
  type SecretRef,
} from "./secrets-vault-core";
import { extraRecipientsForItem } from "./secrets-vault-sharing";

export async function reEncryptAll(
  signer: DeviceIdentity,
  recipients: string[],
  commitMessage: (ref: SecretRef) => string,
): Promise<void> {
  const { entries } = await backend.listFiles(SECRETS_PREFIX);
  const batch: BatchFile[] = [];
  for (const e of entries) {
    const ref = parseSecretPath(e.path);
    if (!ref) continue;
    const file = await backend.readFile(e.path);
    if (!file.sha || typeof file.content !== "string" || !file.content) continue;
    shaCache.set(e.path, file.sha);
    const json = await decryptSecrets(file.content, contentIdentity(signer));
    const armored = await encryptSecrets(json, recipients);
    batch.push({ path: e.path, content: armored, message: commitMessage(ref) });
  }
  await commitMany(batch, "Re-encrypt secrets for updated recipients");
}

export async function reEncryptChats(
  signer: DeviceIdentity,
  recipients: string[],
): Promise<void> {
  let entries: { path: string; sha: string }[] = [];
  try {
    ({ entries } = await backend.listFiles("chats/"));
  } catch (_err) {
    return;
  }
  const batch: BatchFile[] = [];
  for (const e of entries) {
    if (!e.path.endsWith(".age")) continue;
    try {
      const file = await backend.readFile(e.path);
      if (!file.sha || typeof file.content !== "string" || !file.content) continue;
      shaCache.set(e.path, file.sha);
      const json = await decryptSecrets(file.content, contentIdentity(signer));
      const armored = await encryptSecrets(json, recipients);
      batch.push({ path: e.path, content: armored, message: `Re-encrypt ${e.path} for updated recipients` });
    } catch (_err) {
      /* intentional */
    }
  }
  await commitMany(batch, "Re-encrypt chats for updated recipients");
}

async function processSingleItemForReencrypt(
  entry: { path: string; sha: string },
  signer: DeviceIdentity,
  recipients: string[],
  commitMessage: (kind: EncryptedItemKind, id: string) => string,
): Promise<BatchFile | null> {
  const kind = classifyEncryptedPath(entry.path);
  if (!kind) return null;
  const file = await backend.readFile(entry.path);
  if (!file.sha || typeof file.content !== "string" || !file.content) return null;
  shaCache.set(entry.path, file.sha);
  const env = parseEncryptedEnvelope(file.content);
  if (!env) return null;
  const payload = await decryptItemPayload<unknown>(env.ciphertext, contentIdentity(signer));
  const armored = await encryptItemPayload(payload, recipients);
  const headerEnd = file.content.indexOf("-----BEGIN AGE ENCRYPTED FILE-----");
  const header = headerEnd >= 0 ? file.content.slice(0, headerEnd) : "---\n---\n";
  return { path: entry.path, content: `${header}${armored}\n`, message: commitMessage(kind, env.fm.id) };
}

export async function reencryptAllItems(
  signer: DeviceIdentity,
  recipients: string[],
  commitMessage: (kind: EncryptedItemKind, id: string) => string,
): Promise<void> {
  const prefixes: readonly { prefix: string; kind: EncryptedItemKind }[] = [
    { prefix: "notes/", kind: "note" },
    { prefix: "tickets/", kind: "ticket" },
    { prefix: "links/", kind: "link" },
  ];
  const batch: BatchFile[] = [];
  for (const { prefix } of prefixes) {
    let entries: { path: string; sha: string }[] = [];
    try {
      ({ entries } = await backend.listFiles(prefix));
    } catch (_err) {
      continue;
    }
    for (const e of entries) {
      try {
        const file = await processSingleItemForReencrypt(e, signer, recipients, commitMessage);
        if (file) batch.push(file);
      } catch (_err) {
        /* intentional */
      }
    }
  }
  await commitMany(batch, "Re-encrypt items for updated recipients");
}

// ─── Envelope re-seal helpers (migration + rotation) ─────────────────────────

export async function reencryptSecretsTo(
  readIdentity: string,
  vaultRecipient: string,
  message: (ref: SecretRef) => string,
): Promise<void> {
  const { entries } = await backend.listFiles(SECRETS_PREFIX);
  const batch: BatchFile[] = [];
  for (const e of entries) {
    const ref = parseSecretPath(e.path);
    if (!ref) continue;
    const file = await backend.readFile(e.path);
    if (!file.sha || typeof file.content !== "string" || !file.content) continue;
    shaCache.set(e.path, file.sha);
    const json = await decryptSecrets(file.content, readIdentity);
    batch.push({
      path: e.path,
      content: await encryptSecrets(json, [vaultRecipient]),
      message: message(ref),
    });
  }
  await commitMany(batch, "Re-encrypt secrets to the vault key");
}

async function processSingleItemTo(
  entry: { path: string; sha: string },
  kind: EncryptedItemKind,
  readIdentity: string,
  vaultRecipient: string,
  message: (kind: EncryptedItemKind, id: string) => string,
): Promise<BatchFile | null> {
  if (classifyEncryptedPath(entry.path) !== kind) return null;
  const file = await backend.readFile(entry.path);
  if (!file.sha || typeof file.content !== "string" || !file.content) return null;
  shaCache.set(entry.path, file.sha);
  const env = parseEncryptedEnvelope(file.content);
  if (!env) return null;
  const payload = await decryptItemPayload<unknown>(env.ciphertext, readIdentity);
  const extra = await extraRecipientsForItem(kind, env.fm.id);
  const recipients = Array.from(new Set([vaultRecipient, ...extra]));
  const armored = await encryptItemPayload(payload, recipients);
  const headerEnd = file.content.indexOf("-----BEGIN AGE ENCRYPTED FILE-----");
  const header = headerEnd >= 0 ? file.content.slice(0, headerEnd) : "---\n---\n";
  return {
    path: entry.path,
    content: `${header}${armored}\n`,
    message: message(kind, env.fm.id),
  };
}

export async function reencryptItemsTo(
  readIdentity: string,
  vaultRecipient: string,
  message: (kind: EncryptedItemKind, id: string) => string,
): Promise<void> {
  const itemPrefixes: readonly { prefix: string; kind: EncryptedItemKind }[] = [
    { prefix: "notes/", kind: "note" },
    { prefix: "tickets/", kind: "ticket" },
    { prefix: "links/", kind: "link" },
  ];
  const batch: BatchFile[] = [];
  for (const { prefix, kind } of itemPrefixes) {
    let entries: { path: string; sha: string }[] = [];
    try {
      ({ entries } = await backend.listFiles(prefix));
    } catch (_err) {
      continue;
    }
    for (const e of entries) {
      try {
        const file = await processSingleItemTo(e, kind, readIdentity, vaultRecipient, message);
        if (file) batch.push(file);
      } catch (_err) {
        /* intentional */
      }
    }
  }
  await commitMany(batch, "Re-encrypt items to the vault key");
}

export async function rotateVaultKey(
  signer: DeviceIdentity,
  recoverySigning: RecoverySigningKey | undefined,
  reason: string,
): Promise<VaultKey> {
  const current = getActiveVaultKey();
  const readIdentity = current ? current.identity : signer.identity;
  const next = await generateVaultKey();
  const secretLabel = (ref: SecretRef) =>
    `Re-encrypt secret "${ref.vault ? `${ref.vault}/${ref.name}` : ref.name}" ${reason}`;
  await reencryptSecretsTo(readIdentity, next.recipient, secretLabel);
  await reencryptItemsTo(
    readIdentity,
    next.recipient,
    (kind, id) => `Re-encrypt ${kind} "${id}" ${reason}`,
  );
  const epoch = ((await readKeyboxEpoch(signer)) ?? 1) + 1;
  const recipients = await collectVaultRecipients(signer);
  await writeKeybox(next, recipients, `Rotate keybox (epoch ${epoch}) ${reason}`, {
    epoch,
    recoverySigning,
  });
  setActiveVaultKey(next);
  return next;
}

export async function reEncryptVaultIfMembersChanged(
  signer: DeviceIdentity,
  previousSignature: string | null,
): Promise<{ changed: boolean; signature: string }> {
  const recipients = await collectVaultRecipients(signer);
  const signature = recipientSignature(recipients);
  if (await keyboxExists()) return { changed: false, signature };
  if (signature === previousSignature) return { changed: false, signature };

  const { entries } = await backend.listFiles(SECRETS_PREFIX);
  const batch: BatchFile[] = [];
  for (const e of entries) {
    const ref = parseSecretPath(e.path);
    if (!ref) continue;
    try {
      const file = await backend.readFile(e.path);
      if (!file.sha || typeof file.content !== "string" || !file.content) continue;
      shaCache.set(e.path, file.sha);
      const json = await decryptSecrets(file.content, contentIdentity(signer));
      const armored = await encryptSecrets(json, recipients);
      const label = ref.vault ? `${ref.vault}/${ref.name}` : ref.name;
      batch.push({ path: e.path, content: armored, message: `Re-encrypt secret "${label}" for current members` });
    } catch {
      // can't decrypt or transient — skip; an authorized device re-seals it.
    }
  }
  await commitMany(batch, "Re-encrypt secrets for current members");
  await reencryptAllItems(
    signer,
    recipients,
    (kind, id) => `Re-encrypt ${kind} "${id}" for current members`,
  );
  await reEncryptChats(signer, recipients);
  return { changed: true, signature };
}
