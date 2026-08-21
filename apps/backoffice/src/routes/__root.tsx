import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/queryClient'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Outlet />
        <Toaster position="top-right" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
