import { useRouterState } from '@tanstack/react-router'
import { AppSidebar } from './AppSidebar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from './ui/breadcrumb'
import { Separator } from './ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from './ui/sidebar'

const routeLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/users': 'Users',
  '/subscriptions': 'Subscriptions',
  '/vaults': 'Vaults & Agents',
}

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useRouterState({ select: (s) => s.location })
  const pageLabel =
    routeLabels['/' + location.pathname.split('/')[1]] ?? 'Dashboard'

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto min-w-0">
            <div className="flex flex-col gap-6 p-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
