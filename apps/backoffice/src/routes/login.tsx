import { createFileRoute, redirect } from '@tanstack/react-router'
import { LoginPage } from '@/components/LoginPage'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession()
    if (session?.user) throw redirect({ to: '/auth-callback' })
  },
  component: LoginPage,
})
