/**
 * Vault-scoped localStorage persistence for the notes and tickets stores.
 *
 * The Zustand persist middleware uses a single key per store by default
 * (`notekit:notes`, `notekit:tickets`). With two accounts on the same
 * browser — or two vaults under the same account — those keys are shared,
 * which lets stale state from one vault leak into the next. This module
 * rebinds each store's persist key to include the active vault's id (or a
 * stable fallback derived from owner/repo/branch for legacy responses), so
 * every vault gets its own slot.
 *
 * The default `storage` set in each store is a no-op, so any state mutated
 * BEFORE the binder runs (e.g. during the brief window where the app is
 * resolving which vault to open) never touches localStorage at all. After
 * bind, future state changes are persisted to the vault-scoped key, and
 * the saved state for that vault is rehydrated into the store.
 */
import { createJSONStorage } from "zustand/middleware";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import type { VaultRef } from "./vault-api";

let boundKey: string | null = null;

const realStorage = () => localStorage;
const noopStorage = () => ({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
});

/**
 * Derive a stable per-vault persistence key. Prefers the server-side id,
 * falling back to provider/owner/repo/branch for older API responses that
 * don't include an id field.
 */
function vaultPersistenceKey(vault: VaultRef): string {
  if (vault.id) return vault.id;
  const provider = vault.provider ?? "git";
  return `${provider}/${vault.owner}/${vault.repo}@${vault.branch}`;
}

/**
 * Bind notes + tickets persistence to the given vault. Reads any saved
 * state for this vault into the stores and routes future writes to a
 * vault-scoped localStorage slot. Idempotent — calling with the same vault
 * twice is a cheap no-op.
 */
export async function bindVaultPersistence(vault: VaultRef): Promise<void> {
  const key = vaultPersistenceKey(vault);
  if (boundKey === key) return;
  boundKey = key;

  useNotesStore.persist.setOptions({
    name: `notekit:notes:${key}`,
    storage: createJSONStorage(realStorage),
  });
  useTicketsStore.persist.setOptions({
    name: `notekit:tickets:${key}`,
    storage: createJSONStorage(realStorage),
  });

  await Promise.all([
    useNotesStore.persist.rehydrate(),
    useTicketsStore.persist.rehydrate(),
  ]);
}

/**
 * Detach persistence so subsequent in-memory mutations don't touch
 * localStorage. Called when no vault is active (e.g. between sign-out and
 * the next vault pick, or after deleting the last vault).
 */
export function unbindVaultPersistence(): void {
  if (boundKey === null) return;
  boundKey = null;
  useNotesStore.persist.setOptions({
    name: "notekit:notes:__unbound",
    storage: createJSONStorage(noopStorage),
  });
  useTicketsStore.persist.setOptions({
    name: "notekit:tickets:__unbound",
    storage: createJSONStorage(noopStorage),
  });
}
