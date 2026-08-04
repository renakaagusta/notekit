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
import type { DeviceIdentity } from "./crypto/device-key";
import type { ChatMessage } from "../stores/aiChatStore";
import {
  getVaultBackend,
  encryptVaultContent,
  decryptVaultContent,
} from "./secrets-vault";

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

/** Read + decrypt the session index (newest first). Empty if none yet. */
export async function listChatSessions(device: DeviceIdentity): Promise<ChatSessionMeta[]> {
  const backend = getVaultBackend();
  const file = await backend.readFile(INDEX_PATH);
  if (file.sha) shaCache.set(INDEX_PATH, file.sha);
  if (typeof file.content !== "string" || !file.content) return [];
  try {
    const json = await decryptVaultContent(file.content, device);
    const list = JSON.parse(json) as ChatSessionMeta[];
    return list.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  } catch {
    return [];
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

/** Encrypt + write a session file, then refresh the index. */
export async function writeChatSession(
  session: ChatSession,
  device: DeviceIdentity,
): Promise<void> {
  const backend = getVaultBackend();
  const path = sessionPath(session.id);
  await ensureSha(path);
  const armored = await encryptVaultContent(JSON.stringify(session), device);
  const res = await backend.writeFile(
    path,
    armored,
    `notekit: save chat "${session.title || session.id}"`,
    shaCache.get(path),
  );
  shaCache.set(path, res.sha);

  await updateIndex(device, (list) => {
    const meta: ChatSessionMeta = {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
    };
    const rest = list.filter((m) => m.id !== session.id);
    return [meta, ...rest];
  });
}

/** Delete a session file + drop it from the index. */
export async function deleteChatSession(
  id: string,
  device: DeviceIdentity,
): Promise<void> {
  const backend = getVaultBackend();
  const path = sessionPath(id);
  await ensureSha(path);
  const sha = shaCache.get(path);
  if (sha) {
    await backend.deleteFile(path, sha, `notekit: delete chat ${id}`).catch(() => {});
    shaCache.delete(path);
  }
  await updateIndex(device, (list) => list.filter((m) => m.id !== id));
}

/** Read → mutate → write the encrypted index atomically-ish (optimistic sha). */
async function updateIndex(
  device: DeviceIdentity,
  mutate: (list: ChatSessionMeta[]) => ChatSessionMeta[],
): Promise<void> {
  const backend = getVaultBackend();
  const current = await listChatSessions(device);
  const next = mutate(current)
    .slice()
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const armored = await encryptVaultContent(JSON.stringify(next), device);
  const res = await backend.writeFile(
    INDEX_PATH,
    armored,
    "notekit: update chat index",
    shaCache.get(INDEX_PATH),
  );
  shaCache.set(INDEX_PATH, res.sha);
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
