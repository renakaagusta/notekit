import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { VaultRef, VaultSettings } from "../lib/vault-api";

export type VaultPhase =
  | "unknown"
  | "needs-token"
  | "needs-pick"
  | "ready"
  | "switching"
  | "error";

interface VaultState {
  phase: VaultPhase;
  /** The active vault, kept in sync with `activeId`. Mirrored for ergonomic reads. */
  vault: VaultRef | null;
  /** Every vault the user has registered. */
  vaults: VaultRef[];
  /** Id of the active vault. */
  activeId: string | null;
  /** Settings for the active vault (populated on activation). */
  activeSettings: VaultSettings | null;
  /** Per-vault settings cache, keyed by vault id. */
  settingsByVault: Record<string, VaultSettings>;
  error: string | null;
  setPhase(phase: VaultPhase): void;
  setVault(vault: VaultRef | null): void;
  setVaults(vaults: VaultRef[], activeId: string | null): void;
  upsertVault(vault: VaultRef): void;
  removeVault(id: string): void;
  setActiveId(id: string | null): void;
  setError(error: string | null): void;
  setSettingsFor(vaultId: string, settings: VaultSettings): void;
  setActiveSettings(settings: VaultSettings | null): void;
}

export const useVaultStore = create<VaultState>()(
  immer((set) => ({
    phase: "unknown",
    vault: null,
    vaults: [],
    activeId: null,
    activeSettings: null,
    settingsByVault: {},
    error: null,
    setPhase(phase) {
      set((state) => {
        state.phase = phase;
      });
    },
    setVault(vault) {
      set((state) => {
        state.vault = vault;
        state.activeId = vault?.id ?? state.activeId;
        if (vault) state.phase = "ready";
      });
    },
    setVaults(vaults, activeId) {
      set((state) => {
        state.vaults = vaults;
        state.activeId = activeId;
        state.vault = vaults.find((v) => v.id === activeId) ?? null;
      });
    },
    upsertVault(vault) {
      set((state) => {
        const idx = state.vaults.findIndex((v) => v.id === vault.id);
        if (idx >= 0) state.vaults[idx] = vault;
        else state.vaults.push(vault);
      });
    },
    removeVault(id) {
      set((state) => {
        state.vaults = state.vaults.filter((v) => v.id !== id);
        if (state.activeId === id) {
          state.activeId = state.vaults[0]?.id ?? null;
          state.vault = state.vaults[0] ?? null;
        }
      });
    },
    setActiveId(id) {
      set((state) => {
        state.activeId = id;
        state.vault = state.vaults.find((v) => v.id === id) ?? state.vault;
      });
    },
    setError(error) {
      set((state) => {
        state.error = error;
        if (error) state.phase = "error";
      });
    },
    setSettingsFor(vaultId, settings) {
      set((state) => {
        state.settingsByVault[vaultId] = settings;
        if (state.activeId === vaultId) state.activeSettings = settings;
      });
    },
    setActiveSettings(settings) {
      set((state) => {
        state.activeSettings = settings;
        if (settings && state.activeId) {
          state.settingsByVault[state.activeId] = settings;
        }
      });
    },
  })),
);
