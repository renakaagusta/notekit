import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { DatabaseIcon, BotIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { StatsCard } from '@/components/stats-card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { backend } from '@/lib/backend'

export const Route = createFileRoute('/_authenticated/vaults')({
  component: VaultsPage,
})

interface VaultsData {
  totalVaults: number
  totalAgents: number
  vaults: {
    id: string
    owner: string
    backend: 'forgejo' | 'github' | 'gitlab'
    encrypted: boolean
    quotaUsedMb: number
    agents: number
  }[]
}

const EMPTY: VaultsData = { totalVaults: 0, totalAgents: 0, vaults: [] }

function VaultsPage() {
  const { data = EMPTY } = useQuery({
    queryKey: ['vaults'],
    queryFn: async () => (await backend.get<VaultsData>('/backoffice/vaults')).data,
    retry: false,
    throwOnError: false,
    placeholderData: EMPTY,
  })

  return (
    <>
      <PageHeader title="Vaults & Agents" description="Managed vaults, storage quotas, and agent access." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatsCard title="Total Vaults" value={data.totalVaults} icon={DatabaseIcon} />
        <StatsCard title="Total Agents" value={data.totalAgents} icon={BotIcon} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead>Backend</TableHead>
              <TableHead>Encryption</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead className="text-right">Agents</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.vaults.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center text-sm">
                  No vaults to show yet.
                </TableCell>
              </TableRow>
            ) : (
              data.vaults.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.owner}</TableCell>
                  <TableCell className="capitalize">{v.backend}</TableCell>
                  <TableCell>
                    <Badge variant={v.encrypted ? 'default' : 'secondary'}>
                      {v.encrypted ? 'E2EE' : 'Plaintext'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{v.quotaUsedMb} MB</TableCell>
                  <TableCell className="text-right">{v.agents}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
