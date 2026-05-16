# @notekit/api

Hono API server. Handles auth, sessions, and (later) per-note share + sync orchestration.

## Quick start

```bash
cp .env.example .env
# fill in GITHUB_* and GOOGLE_* credentials (see below)

pnpm install
pnpm --filter @notekit/api dev
```

API will boot on http://localhost:3001.

## Configuring OAuth providers

The server reads OAuth credentials from `.env`. Without them, the corresponding sign-in button is disabled on the web client. Configure each provider once; the credentials are stored locally only.

### GitHub

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
   URL: <https://github.com/settings/developers>
2. Fill in:
   - **Application name**: `NoteKit (dev)`
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:3001/auth/github/callback`
3. Click **Register application**.
4. On the next screen, copy **Client ID** into `GITHUB_CLIENT_ID`.
5. Click **Generate a new client secret**, copy it into `GITHUB_CLIENT_SECRET`.
6. Restart the API server.

For production, create a **second** OAuth app with `https://notekit.app` URLs — never share dev and prod credentials.

### Google

1. Go to <https://console.cloud.google.com/apis/credentials>.
2. If you don't have a project, create one (`NoteKit`).
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: `NoteKit`
   - Support email + dev contact: your address
   - Scopes: add `openid`, `email`, `profile` (no others needed at this stage)
   - Test users: add your own Google account while the app is in "Testing" mode.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `NoteKit (dev)`
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:3001/auth/google/callback`
5. Copy **Client ID** → `GOOGLE_CLIENT_ID`, **Client secret** → `GOOGLE_CLIENT_SECRET`.
6. Restart the API server.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/auth/providers` | Which OAuth providers are configured (`{github: bool, google: bool}`) |
| GET | `/auth/:provider` | Begin OAuth (redirects to provider) |
| GET | `/auth/:provider/callback` | OAuth callback; sets session cookie; redirects to web app |
| GET | `/auth/me` | Current user (`{user: User \| null}`) |
| POST | `/auth/signout` | Destroy session |

## Data

Dev uses SQLite at `apps/api/data/notekit.db`. Tables are auto-created on first boot. Delete the file to reset.

Production will use Postgres (Drizzle's `pg` driver, same schema).

## License

AGPL-3.0-only.
