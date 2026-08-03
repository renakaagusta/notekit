# @notekit/backoffice

Superadmin console for the NoteKit platform. Vite + React 19 + TanStack Router
+ Tailwind v4 + shadcn UI, authenticated with better-auth (magic link + Google)
against the NoteKit API.

## Menus
- **Dashboard** — platform overview (users, vaults, subscribers, agents)
- **Users** — all NoteKit accounts
- **Subscriptions** — NoteKit Plus revenue across Apple / Play / Stripe
- **Vaults & Agents** — managed vaults, storage quotas, agent access

## Develop
```bash
pnpm --filter @notekit/backoffice dev
```
Set `VITE_API_URL` (see `.env.example`). The NoteKit API must expose better-auth
under `/backoffice/auth` and the admin endpoints under `/backoffice/*`, and must
allow this origin in its CORS allowlist.

## Access control
The backoffice is gated to platform admins. `/backoffice/me` returns the session
user only when their email is in the API's `BACKOFFICE_ADMIN_EMAILS` allowlist;
everyone else is bounced to the login screen.
