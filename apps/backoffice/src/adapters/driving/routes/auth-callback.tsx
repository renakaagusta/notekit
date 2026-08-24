import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LoaderIcon } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { authClient, getMe, setSessionToken , useStore  } from '../../../composition'

export const Route = createFileRoute('/auth-callback')({
  component: AuthCallback,
})

function AuthCallback() {
  const navigate = useNavigate()
  const { setUser } = useStore()

  useEffect(() => {
    async function finish() {
      const params = new URLSearchParams(window.location.search)
      const error = params.get('error')
      if (error) {
        toast.error(error === 'access_denied' ? 'Login cancelled' : `Login failed: ${error}`)
        navigate({ to: '/login' })
        return
      }

      const { data: session, error: sessionError } = await authClient.getSession()
      if (sessionError || !session) {
        toast.error('Login failed. Please try again.')
        navigate({ to: '/login' })
        return
      }

      setSessionToken(session.session.token)

      const { user } = await getMe()
      if (!user) {
        toast.error('This account does not have admin access.')
        await authClient.signOut()
        navigate({ to: '/login' })
        return
      }

      setUser({
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        isSuperAdmin: user.isSuperAdmin,
      })

      navigate({ to: '/dashboard' })
    }

    finish().catch((err) => {
      console.error('[auth-callback] unexpected error', err)
      toast.error('Login failed. Please try again.')
      navigate({ to: '/login' })
    })
  }, [navigate, setUser])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <LoaderIcon className="text-muted-foreground size-8 animate-spin" />
        <p className="text-muted-foreground text-sm">Signing you in…</p>
      </div>
    </div>
  )
}
