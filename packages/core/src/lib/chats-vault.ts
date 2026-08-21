/**
 * AI chat history — encrypted, git-backed, multi-session.
 *
 * Mirrors the secrets-vault pattern: each session is an age-encrypted JSON file
 * committed straight to the vault (independent of the notes sync loop, so it
 * pulls on other devices via the normal git sync). Git history of `chats/` is
 * the audit trail. Titles live INSIDE the encrypted index — never plaintext.
 *
 * Reuses the shared vault seam from secrets-vault: `getVaultBackend()` for file
 * I/O and `encryptVaultContent`/`decryptVaultContent` for envelope-aware E2EE.
 */
import type { ChatMessage } from "../stores/aiChatStore";
import type { DeviceIdentity } from "./crypto/device-key";
import {
  getVaultBackend,
  encryptVaultContent,
  encryptVaultContentMany,
  decryptVaultContent,
} from "./secrets-vault";
import * as cache from "./vault-cache";
import { currentVaultScope } from "./vault-persistence";

export interface ChatSession {
  id: string;
  title: string;
  agentSlug: string | null;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  updatedAt: string;
}

const CHATS_PREFIX = "chats/";
const INDEX_PATH = "chats/index.json.age";

function sessionPath(id: string): string {
  return `${CHATS_PREFIX}${id}.json.age`;
}

// Remember file shas so writes are optimistic (avoid clobbering a concurrent edit).
const shaCache = new Map<string, string>();

const now = () => new Date().toISOString();

/** Decrypt + sort a raw index payload. */
function parseIndex(json: string): ChatSessionMeta[] {
  const list = JSON.parse(json) as ChatSessionMeta[];
  return list.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

/** Read + decrypt the session index (newest first). Empty if none yet. */
export async function listChatSessions(device: DeviceIdentity): Promise<ChatSessionMeta[]> {
  const backend = getVaultBackend();
  const file = await backend.readFile(INDEX_PATH);
  if (file.sha) shaCache.set(INDEX_PATH, file.sha);
  if (typeof file.content !== "string" || !file.content) return [];
  // Warm the offline cache with the ciphertext (never the decrypted list) so a
  // later cold open can render history from disk before the network responds.
  const scope = currentVaultScope();
  if (scope && file.sha) {
    void cache.putFile(scope, { path: INDEX_PATH, sha: file.sha, content: file.content });
  }
  try {
    return parseIndex(await decryptVaultContent(file.content, device));
  } catch {
    return [];
  }
}

/**
 * Cache-only read of the session index — decrypts the last-known ciphertext from
 * IndexedDB, no network. Returns null when nothing is cached, so the caller
 * falls through to {@link listChatSessions}. The offline-first (stale-while-
 * revalidate) half of chat history: render this instantly, then revalidate.
 */
export async function readCachedChatSessions(
  device: DeviceIdentity,
): Promise<ChatSessionMeta[] | null> {
  const scope = currentVaultScope();
  if (!scope) return null;
  const hit = await cache.getFile(scope, INDEX_PATH);
  if (!hit || !hit.content) return null;
  try {
    return parseIndex(await decryptVaultContent(hit.content, device));
  } catch {
    return null;
  }
}

/** Read + decrypt a full session, or null if missing. */
export async function readChatSession(
  id: string,
  device: DeviceIdentity,
): Promise<ChatSession | null> {
  const backend = getVaultBackend();
  const path = sessionPath(id);
  const file = await backend.readFile(path);
  if (file.sha) shaCache.set(path, file.sha);
  if (typeof file.content !== "string" || !file.content) return null;
  try {
    return JSON.parse(await decryptVaultContent(file.content, device)) as ChatSession;
  } catch {
    return null;
  }
}

async function ensureSha(path: string): Promise<void> {
  if (shaCache.has(path)) return;
  const file = await getVaultBackend().readFile(path);
  if (file.sha) shaCache.set(path, file.sha);
}

/** Read the index, apply a mutation, and return the sorted next list. */
async function computeIndex(
  device: DeviceIdentity,
  mutate: (list: ChatSessionMeta[]) => ChatSessionMeta[],
): Promise<ChatSessionMeta[]> {
  const current = await listChatSessions(device);
  return mutate(current)
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

/**
 * Encrypt + persist a session AND its index entry in ONE git commit.
 *
 * Two separate commits back-to-back (session file, then index) race on the
 * server: the git backend rejects a rapid second commit to the same branch
 * (observed as `net::ERR_FAILED`). Batching via `commitFiles` (PUT /vault/files)
 * is a single commit, so there's no second push to collide with. Falls back to
 * sequential writes only for backends without batch support.
 */
export async function writeChatSession(
  session: ChatSession,
  device: DeviceIdentity,
): Promise<void> {
  const backend = getVaultBackend();
  const nextIndex = await computeIndex(device, (list) => {
    const meta: ChatSessionMeta = {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
    };
    return [meta, ...list.filter((m) => m.id !== session.id)];
  });
  // Encrypt session + index in one pass so recipients are gathered a single time.
  const armored = await encryptVaultContentMany(
    [JSON.stringify(session), JSON.stringify(nextIndex)],
    device,
  );
  if (!armored[0] || !armored[1]) throw new Error("encryptVaultContentMany returned fewer results than expected");
  const files: { path: string; content: string }[] = [
    { path: sessionPath(session.id), content: armored[0] },
    { path: INDEX_PATH, content: armored[1] },
  ];
  const message = `notekit: save chat "${session.title || session.id}"`;

  if (backend.commitFiles) {
    await backend.commitFiles(files, message);
    // commitFiles doesn't return per-file shas; drop stale entries so the next
    // fallback write (if any) re-reads HEAD.
    shaCache.delete(sessionPath(session.id));
    shaCache.delete(INDEX_PATH);
  } else {
    for (const f of files) {
      await ensureSha(f.path);
      const res = await backend.writeFile(f.path, f.content, message, shaCache.get(f.path));
      shaCache.set(f.path, res.sha);
    }
  }
}

/** Drop a session from the index, then remove its file. */
export async function deleteChatSession(
  id: string,
  device: DeviceIdentity,
): Promise<void> {
  const backend = getVaultBackend();
  const path = sessionPath(id);
  await ensureSha(path);
  const sha = shaCache.get(path);

  // Update the index first so the row disappears even if the file delete lags;
  // a leftover .age with no index entry is harmless (readChatSession → null).
  const nextIndex = await computeIndex(device, (list) => list.filter((m) => m.id !== id));
  const indexArmored = await encryptVaultContent(JSON.stringify(nextIndex), device);
  const message = `notekit: delete chat ${id}`;
  if (backend.commitFiles) {
    await backend.commitFiles([{ path: INDEX_PATH, content: indexArmored }], message);
    shaCache.delete(INDEX_PATH);
  } else {
    await ensureSha(INDEX_PATH);
    const res = await backend.writeFile(INDEX_PATH, indexArmored, message, shaCache.get(INDEX_PATH));
    shaCache.set(INDEX_PATH, res.sha);
  }

  if (sha) {
    await backend.deleteFile(path, sha, message).catch(() => { /* intentional noop — missing file is harmless */ });
    shaCache.delete(path);
  }
}

/** Derive a session title from its first user message. */
export function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser
    ? firstUser.parts
        .filter((p): p is { kind: "text"; text: string } => p.kind === "text")
        .map((p) => p.text)
        .join(" ")
        .trim()
    : "";
  const clean = text.replace(/\s+/g, " ");
  return clean ? (clean.length > 60 ? clean.slice(0, 60) + "…" : clean) : "New chat";
}

export { now as chatTimestamp };
