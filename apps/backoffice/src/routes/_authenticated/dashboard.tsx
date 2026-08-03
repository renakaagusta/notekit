import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  UsersIcon,
  DatabaseIcon,
  CreditCardIcon,
  BotIcon,
} from 'lucide-react'
import { StatsCard } from '@/components/stats-card'
import { PageHeader } from '@/components/page-header'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { backend } from '@/lib/backend'

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})

interface Overview {
  totalUsers: number
  activeVaults: number
  plusSubscribers: number
  agents: number
  recentSignups: Array<{ id: string; name: string; email: string; plan: string; joinedAt: string }>
}

// Endpoints are not wired on the API yet — fall back to a sensible empty
// shape so the dashboard renders cleanly until /backoffice/overview lands.
const EMPTY: Overview = {
  totalUsers: 0,
  activeVaults: 0,
  plusSubscribers: 0,
  agents: 0,
  recentSignups: [],
}

function DashboardPage() {
  const { data = EMPTY } = useQuery({
    queryKey: ['overview'],
    queryFn: async () => {
      const res = await backend.get<Overview>('/backoffice/overview')
      return res.data
    },
    retry: false,
    // Until the endpoint exists, treat any failure as the empty overview.
    throwOnError: false,
    placeholderData: EMPTY,
  })

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of your NoteKit platform." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Users" value={data.totalUsers} icon={UsersIcon} link={{ href: '/users', label: 'View users' }} />
        <StatsCard title="Active Vaults" value={data.activeVaults} icon={DatabaseIcon} link={{ href: '/vaults', label: 'View vaults' }} />
        <StatsCard title="Plus Subscribers" value={data.plusSubscribers} icon={CreditCardIcon} link={{ href: '/subscriptions', label: 'View billing' }} />
        <StatsCard title="Agents" value={data.agents} icon={BotIcon} link={{ href: '/vaults', label: 'View agents' }} />
      </div>

      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h3 className="text-sm font-semibold">Recent sign-ups</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recentSignups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">
                  No sign-ups to show yet.
                </TableCell>
              </TableRow>
            ) : (
              data.recentSignups.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.plan === 'plus' ? 'default' : 'secondary'}>{u.plan}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right">{u.joinedAt}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
