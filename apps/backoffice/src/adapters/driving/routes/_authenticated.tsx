import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { authClient, getMe, setSessionToken , useStore  } from '../../../composition'
import { AppShell } from '../components/AppShell'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    const { data: session, error: sessionError } = await authClient.getSession()
    if (sessionError || !session) {
      throw redirect({ to: '/login' })
    }

    // Keep the session token in memory for API bearer auth.
    setSessionToken(session.session.token)

    const { user } = await getMe()
    if (!user) {
      // Authenticated but not a platform admin — bounce to login.
      throw redirect({ to: '/login' })
    }

    useStore.getState().setUser({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isSuperAdmin: user.isSuperAdmin,
    })
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
