import { useStore } from '@/store'

// In-memory better-auth session token — not persisted for security.
let _sessionToken: string | null = null

export function setSessionToken(token: string | null) {
  _sessionToken = token
}

export function getSessionToken() {
  return _sessionToken
}

function isAuthError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status
  return status === 401 || status === 403
}

export function handleAuthError(error: unknown) {
  if (isAuthError(error)) {
    setSessionToken(null)
    useStore.getState().clearAuth()
    window.location.href = '/login'
  }
}
