import { useNavigate } from '@tanstack/react-router'
import {
  CreditCardIcon,
  DatabaseIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  UsersIcon,
} from 'lucide-react'
import * as React from 'react'

import { toast } from 'sonner'
import { authClient, setSessionToken , queryClient , useStore  } from '../../../composition'
import { BrandMark } from './BrandMark'
import { NavMain } from './nav-main'
import { ThemeSwitcher } from './theme-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from './ui/sidebar'

const navItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboardIcon },
  { title: 'Users', url: '/users', icon: UsersIcon },
  { title: 'Subscriptions', url: '/subscriptions', icon: CreditCardIcon },
  { title: 'Vaults & Agents', url: '/vaults', icon: DatabaseIcon },
]

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { user, clearAuth } = useStore()
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await authClient.signOut()
    } catch {
      // ignore logout API errors
    }
    setSessionToken(null)
    clearAuth()
    queryClient.clear()
    navigate({ to: '/login' })
    toast.success('Logged out')
  }

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <BrandMark className="size-7" />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">NoteKit</span>
                <span className="text-muted-foreground text-xs">Backoffice</span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.name ?? user?.email ?? 'User'}</span>
                {user?.name && (
                  <span className="text-muted-foreground text-xs">{user.email}</span>
                )}
              </div>
              <ThemeSwitcher />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
              <LogOutIcon className="size-4" />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
