/**
 * Per-item E2EE sharing: grant/revoke cross-user access to individual encrypted
 * notes, tickets, and links. Share manifests are persisted at
 * `.notekit/shares/{kind}-{id}.json` (cleartext — they only contain public keys).
 *
 * Imported by secrets-vault-reencrypt.ts (extraRecipientsForItem) and
 * re-exported from secrets-vault.ts for external callers.
 */
import type { DeviceIdentity } from "./crypto/device-key";
import {
  classifyEncryptedPath,
  encryptItemPayload,
  parseEncryptedEnvelope,
  decryptItemPayload,
  type EncryptedItemKind,
} from "./crypto/item-crypto";
import { encryptToPassphrase, generateSharePassphrase } from "./crypto/vault-crypto";
import {
  backend,
  shaCache,
  contentIdentity,
  contentRecipients,
  sharePath,
  itemPrefix,
  SHARES_PREFIX,
} from "./secrets-vault-core";

export { SHARES_PREFIX };

export interface ShareGrant {
  email: string;
  signingKey: string;
  recipients: string[];
  grantedAt: string;
}

export interface ShareManifest {
  version: 1;
  kind: EncryptedItemKind;
  id: string;
  shares: ShareGrant[];
}

export interface PassphraseShare {
  passphrase: string;
  armored: string;
}

export async function readShareManifest(
  kind: EncryptedItemKind,
  id: string,
): Promise<ShareManifest | null> {
  const file = await backend.readFile(sharePath(kind, id));
  if (file.sha) shaCache.set(file.path, file.sha);
  if (typeof file.content !== "string" || !file.content) return null;
  try {
    return JSON.parse(file.content) as ShareManifest;
  } catch {
    return null;
  }
}

async function writeShareManifest(manifest: ShareManifest, message: string): Promise<void> {
  const path = sharePath(manifest.kind, manifest.id);
  const result = await backend.writeFile(
    path,
    JSON.stringify(manifest, null, 2),
    message,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

export async function extraRecipientsForItem(
  kind: EncryptedItemKind,
  id: string,
): Promise<string[]> {
  const manifest = await readShareManifest(kind, id);
  if (!manifest) return [];
  const set = new Set<string>();
  for (const g of manifest.shares) for (const r of g.recipients) set.add(r);
  return Array.from(set);
}

export async function recipientsForItem(
  kind: EncryptedItemKind,
  id: string,
  device: DeviceIdentity,
): Promise<string[]> {
  const [base, extra] = await Promise.all([
    contentRecipients(device),
    extraRecipientsForItem(kind, id),
  ]);
  return Array.from(new Set([...base, ...extra]));
}

async function reencryptItem(
  kind: EncryptedItemKind,
  id: string,
  signer: DeviceIdentity,
  recipients: string[],
  message: string,
): Promise<boolean> {
  const { entries } = await backend.listFiles(itemPrefix(kind));
  for (const e of entries) {
    if (classifyEncryptedPath(e.path) !== kind) continue;
    const file = await backend.readFile(e.path);
    if (!file.sha || typeof file.content !== "string" || !file.content) continue;
    const env = parseEncryptedEnvelope(file.content);
    if (!env || env.fm.id !== id) continue;
    const payload = await decryptItemPayload<unknown>(env.ciphertext, contentIdentity(signer));
    const armored = await encryptItemPayload(payload, recipients);
    const headerEnd = file.content.indexOf("-----BEGIN AGE ENCRYPTED FILE-----");
    const header = headerEnd >= 0 ? file.content.slice(0, headerEnd) : "---\n---\n";
    const result = await backend.writeFile(e.path, `${header}${armored}\n`, message, file.sha);
    shaCache.set(e.path, result.sha);
    return true;
  }
  return false;
}

export async function shareItemWith(
  kind: EncryptedItemKind,
  id: string,
  grant: { email: string; signingKey: string; recipients: string[] },
  signer: DeviceIdentity,
): Promise<void> {
  const now = new Date().toISOString();
  const existing =
    (await readShareManifest(kind, id)) ??
    ({ version: 1, kind, id, shares: [] } as ShareManifest);
  const shares = existing.shares.filter((s) => s.email !== grant.email);
  shares.push({ ...grant, grantedAt: now });
  await writeShareManifest(
    { version: 1, kind, id, shares },
    `Share ${kind} "${id}" with ${grant.email}`,
  );
  const recipients = await recipientsForItem(kind, id, signer);
  await reencryptItem(
    kind,
    id,
    signer,
    recipients,
    `Re-encrypt ${kind} "${id}" for share with ${grant.email}`,
  );
}

export async function createPassphraseShare(
  kind: EncryptedItemKind,
  id: string,
  signer: DeviceIdentity,
): Promise<PassphraseShare | null> {
  const { entries } = await backend.listFiles(itemPrefix(kind));
  for (const e of entries) {
    if (classifyEncryptedPath(e.path) !== kind) continue;
    const file = await backend.readFile(e.path);
    if (typeof file.content !== "string" || !file.content) continue;
    const env = parseEncryptedEnvelope(file.content);
    if (!env || env.fm.id !== id) continue;
    const payload = await decryptItemPayload<unknown>(env.ciphertext, contentIdentity(signer));
    const passphrase = generateSharePassphrase();
    const armored = await encryptToPassphrase(JSON.stringify(payload), passphrase);
    return { passphrase, armored };
  }
  return null;
}

export async function listItemShares(
  kind: EncryptedItemKind,
  id: string,
): Promise<ShareGrant[]> {
  return (await readShareManifest(kind, id))?.shares ?? [];
}

export async function unshareItemWith(
  kind: EncryptedItemKind,
  id: string,
  email: string,
  signer: DeviceIdentity,
): Promise<boolean> {
  const manifest = await readShareManifest(kind, id);
  if (!manifest) return false;
  const shares = manifest.shares.filter((s) => s.email !== email);
  if (shares.length === manifest.shares.length) return false;
  await writeShareManifest(
    { version: 1, kind, id, shares },
    `Revoke ${email} from ${kind} "${id}"`,
  );
  const recipients = await recipientsForItem(kind, id, signer);
  await reencryptItem(
    kind,
    id,
    signer,
    recipients,
    `Re-encrypt ${kind} "${id}" after revoking ${email}`,
  );
  return true;
}
