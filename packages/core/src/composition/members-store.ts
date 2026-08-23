/**
 * Composition root for the members store.
 *
 * The ONE place the store is bound to its vault adapter. Wiring runs eagerly at
 * import — before the store loads — so behavior is identical to the old direct
 * vault-api import. Import the store from here.
 */
import { vaultStoragePort } from "../adapters/driven/vault-api";
import { configureMembersStore, useMembersStore } from "../adapters/driving/stores/membersStore";

configureMembersStore({ vault: vaultStoragePort });

export { useMembersStore };
