/**
 * Composition root for the chats vault.
 *
 * This is the ONE place the chats application module is bound to its concrete
 * driven adapter (local ciphertext cache). Wiring happens eagerly at import —
 * exactly when the old module-level direct imports did — so the app's behavior
 * is identical; only the dependency direction is now clean (chats-vault/ depends
 * on ports, the composition root injects the adapter).
 */
import { vaultCacheStoragePort } from "../adapters/driven/vault-cache";
import { createChatsVault } from "../lib/chats-vault";

export const {
  listChatSessions,
  readCachedChatSessions,
  readChatSession,
  writeChatSession,
  deleteChatSession,
} = createChatsVault({
  cache: vaultCacheStoragePort,
});
