// Auth — the backoffice is a superadmin-only panel, so there are no
// per-brand workspaces like in the original template. A user is either a
// platform admin or has no access at all.
export interface User {
  id: string
  email: string
  name?: string
  image?: string | null
  isSuperAdmin: boolean
}
