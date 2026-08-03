import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { AppleIcon, PlayIcon, CreditCardIcon } from 'lucide-react'
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

export const Route = createFileRoute('/_authenticated/subscriptions')({
  component: SubscriptionsPage,
})

interface Billing {
  mrr: number
  apple: number
  play: number
  stripe: number
  subscribers: Array<{
    id: string
    email: string
    processor: 'apple' | 'play' | 'stripe'
    term: 'monthly' | 'yearly' | 'lifetime'
    since: string
  }>
}

const EMPTY: Billing = { mrr: 0, apple: 0, play: 0, stripe: 0, subscribers: [] }

function SubscriptionsPage() {
  const { data = EMPTY } = useQuery({
    queryKey: ['billing'],
    queryFn: async () => (await backend.get<Billing>('/backoffice/billing')).data,
    retry: false,
    throwOnError: false,
    placeholderData: EMPTY,
  })

  return (
    <>
      <PageHeader title="Subscriptions" description="NoteKit Plus revenue across processors." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="MRR" value={`$${data.mrr}`} icon={CreditCardIcon} />
        <StatsCard title="Apple IAP" value={data.apple} icon={AppleIcon} />
        <StatsCard title="Google Play" value={data.play} icon={PlayIcon} />
        <StatsCard title="Stripe / Web" value={data.stripe} icon={CreditCardIcon} />
      </div>

      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h3 className="text-sm font-semibold">Plus subscribers</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Processor</TableHead>
              <TableHead>Term</TableHead>
              <TableHead className="text-right">Since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.subscribers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground py-10 text-center text-sm">
                  No subscribers to show yet.
                </TableCell>
              </TableRow>
            ) : (
              data.subscribers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.email}</TableCell>
                  <TableCell className="capitalize">{s.processor}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{s.term}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right">{s.since}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
