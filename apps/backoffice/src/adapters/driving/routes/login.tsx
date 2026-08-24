import { createFileRoute, redirect } from '@tanstack/react-router'
import { authClient } from '../../../composition'
import { LoginPage } from '../components/LoginPage'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession()
    if (session?.user) throw redirect({ to: '/auth-callback' })
  },
  component: LoginPage,
})
