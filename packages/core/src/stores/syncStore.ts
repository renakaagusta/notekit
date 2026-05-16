import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { SyncState } from "../types/sync";

interface SyncStoreState extends SyncState {
  setPhase(phase: SyncState["phase"]): void;
  markSynced(): void;
  setError(error: string | null): void;
  setPending(count: number): void;
}

export const useSyncStore = create<SyncStoreState>()(
  immer((set) => ({
    phase: "idle",
    lastSyncedAt: null,
    pendingChanges: 0,
    error: null,
    setPhase(phase) {
      set((state) => {
        state.phase = phase;
      });
    },
    markSynced() {
      set((state) => {
        state.phase = "idle";
        state.lastSyncedAt = new Date().toISOString();
        state.pendingChanges = 0;
        state.error = null;
      });
    },
    setError(error) {
      set((state) => {
        state.phase = error ? "error" : "idle";
        state.error = error;
      });
    },
    setPending(count) {
      set((state) => {
        state.pendingChanges = count;
      });
    },
  })),
);
