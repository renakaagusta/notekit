import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { VaultRef } from "../lib/vault-api";

export type VaultPhase =
  | "unknown"
  | "needs-token"
  | "needs-pick"
  | "ready"
  | "error";

interface VaultState {
  phase: VaultPhase;
  vault: VaultRef | null;
  error: string | null;
  setPhase(phase: VaultPhase): void;
  setVault(vault: VaultRef | null): void;
  setError(error: string | null): void;
}

export const useVaultStore = create<VaultState>()(
  immer((set) => ({
    phase: "unknown",
    vault: null,
    error: null,
    setPhase(phase) {
      set((state) => {
        state.phase = phase;
      });
    },
    setVault(vault) {
      set((state) => {
        state.vault = vault;
        if (vault) state.phase = "ready";
      });
    },
    setError(error) {
      set((state) => {
        state.error = error;
        if (error) state.phase = "error";
      });
    },
  })),
);
