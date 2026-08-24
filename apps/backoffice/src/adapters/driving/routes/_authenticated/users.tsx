import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { backend } from '../../../../composition'
import { PageHeader } from '../../components/page-header'
import { Badge } from '../../components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'

export const Route = createFileRoute('/_authenticated/users')({
  component: UsersPage,
})

interface AdminUser {
  id: string
  name: string
  email: string
  plan: 'free' | 'plus'
  provider: string
  createdAt: string
}

function UsersPage() {
  const { data = [] } = useQuery<AdminUser[]>({
    queryKey: ['users'],
    queryFn: async () => (await backend.get<AdminUser[]>('/backoffice/users')).data,
    retry: false,
    throwOnError: false,
    placeholderData: [],
  })

  return (
    <>
      <PageHeader title="Users" description="All NoteKit accounts." />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center text-sm">
                  No users to show yet.
                </TableCell>
              </TableRow>
            ) : (
              data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.plan === 'plus' ? 'default' : 'secondary'}>{u.plan}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{u.provider}</TableCell>
                  <TableCell className="text-muted-foreground text-right">{u.createdAt}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
