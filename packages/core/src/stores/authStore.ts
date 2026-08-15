import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User, GitRemote } from "../types/user";

interface AuthState {
  user: User | null;
  remote: GitRemote | null;
  signIn(user: User): void;
  signOut(): void;
  setRemote(remote: GitRemote | null): void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    immer<AuthState>((set) => ({
      user: null,
      remote: null,
      signIn(user) {
        set((state) => {
          state.user = user;
        });
      },
      signOut() {
        set((state) => {
          state.user = null;
          state.remote = null;
        });
      },
      setRemote(remote) {
        set((state) => {
          state.remote = remote;
        });
      },
    })),
    {
      name: "notekit:auth",
      storage: createJSONStorage(() => localStorage),
      // Persist the user profile (not a secret — it's the user's own account
      // info) so a cold start can render the app from the last-known session
      // and work offline, revalidating against /auth/me when the network is up.
      partialize: (state) => ({ user: state.user, remote: state.remote }),
      version: 1,
    },
  ),
);
