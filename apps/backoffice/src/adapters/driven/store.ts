import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../../domain/types'

interface AuthSlice {
  user: User | null
  setUser: (user: User) => void
  clearAuth: () => void
}

type Store = AuthSlice

export const useStore = create<Store>()(
  persist(
    (set) => ({
      // Auth — the session token is intentionally NOT persisted (kept in
      // memory via http.ts) so it never lands in localStorage.
      user: null,
      setUser: (user) => set({ user }),
      clearAuth: () => set({ user: null }),
    }),
    {
      name: 'notekit-backoffice',
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
