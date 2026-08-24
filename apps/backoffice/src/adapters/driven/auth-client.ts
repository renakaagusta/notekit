import { createAuthClient } from 'better-auth/client'
import { magicLinkClient } from 'better-auth/client/plugins'
import { backend } from './backend'

const apiBaseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// better-auth is mounted under /backoffice/auth on the NoteKit API so it
// never collides with the app's own OAuth routes at /auth.
export const authClient = createAuthClient({
  baseURL: apiBaseURL,
  basePath: '/backoffice/auth',
  plugins: [magicLinkClient()],
})

export interface AuthUser {
  id: string
  email: string
  name?: string
  image?: string | null
  isSuperAdmin: boolean
}

// The backoffice gate. Returns the session user plus whether they're an
// allowlisted platform admin. Anything else is treated as "no access".
export async function getMe(): Promise<{ user: AuthUser | null; error?: string }> {
  try {
    const res = await backend.get<AuthUser>('/backoffice/me')
    return { user: res.data }
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 401 || status === 403) return { user: null }
    return { user: null, error: 'Failed to load your account' }
  }
}

export async function sendMagicLink(email: string): Promise<{ error?: string }> {
  const result = await authClient.signIn.magicLink({
    email,
    callbackURL: `${window.location.origin}/auth-callback`,
  })
  if (result.error) return { error: result.error.message ?? 'Failed to send login link' }
  return {}
}

export function signInWithGoogle(): void {
  authClient.signIn.social({
    provider: 'google',
    callbackURL: `${window.location.origin}/auth-callback`,
  })
}

export async function signOut(): Promise<void> {
  await authClient.signOut()
}
