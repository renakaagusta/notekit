// Backoffice composition root barrel. This is the ONLY place the driving
// adapters (UI components, routes, hooks, store consumers) reach the driven
// adapters (better-auth client, axios backend, session/auth-error handling,
// the TanStack Query client, and the persisted zustand store). The UI imports
// from here instead of from adapters/driven directly, so the driving layer
// never couples to a driven adapter — parity with apps/cli and apps/mcp.

export {
  authClient,
  getMe,
  sendMagicLink,
  signInWithGoogle,
  signOut,
  type AuthUser,
} from '../adapters/driven/auth-client'
export { backend } from '../adapters/driven/backend'
export { setSessionToken, getSessionToken, handleAuthError } from '../adapters/driven/http'
export { queryClient } from '../adapters/driven/queryClient'
export { useStore } from '../adapters/driven/store'
