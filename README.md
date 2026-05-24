# NoteKit

> Notes + tickets in your Git repo. Open source. MCP-first. $1.49/mo for managed hosting.

NoteKit is a notes and tickets application that stores everything in a real Git repository — your repo, your files. Connect it to your own GitHub, or use our free hosted Git server (Forgejo). Everything works offline-first, syncs through the Git protocol, and exposes your knowledge to Claude Code, Cursor, Codex, OpenCode, Continue, Zed, Windsurf, and Claude Desktop via the Model Context Protocol.

## Status

**Pre-alpha — under active development.** See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap.

## Use it in your agent IDE

NoteKit ships a single self-contained `notekit` binary — no Node.js
install, no npm account, no package manager required on the user side.
It includes both the CLI and the MCP server, so one install covers every
surface.

```bash
# One-line install (macOS / Linux):
curl -fsSL https://raw.githubusercontent.com/renakaagusta/notekit/main/scripts/install.sh | sh

# Then wire it into any agent IDE:
notekit auth login
notekit mcp doctor              # verify your setup is green
notekit mcp install cursor      # also: claude-code, codex, opencode,
                                # continue, zed, windsurf, claude-desktop
```

The installer writes the right config file in the right place for that
IDE — the entry points at the absolute path of your `notekit` binary,
which then runs `notekit mcp serve` in-process. No `npx`, no cold-start
download.

### Project-aware scoping

Drop a one-line `.notekit` marker in a code repo and every notes/tickets
tool the agent calls scopes to that project (with read-everywhere
fallback to global):

```
project: my-app
```

The MCP server resolves it by walking up from the IDE's cwd. See
[`apps/mcp/README.md`](apps/mcp/README.md) for per-client recipes and
[`docs/MCP_DISTRIBUTION.md`](docs/MCP_DISTRIBUTION.md) for the
project-scoping model.

## Quick start

```bash
pnpm install

# 1. Configure OAuth (one-time)
cp apps/api/.env.example apps/api/.env
# follow apps/api/README.md to register GitHub + Google OAuth apps,
# then paste the client IDs/secrets into apps/api/.env

# 2. Run everything
pnpm dev
```

This starts:

- API at http://localhost:3001 (`@notekit/api`)
- Web at http://localhost:5173 (`@notekit/web`)

Open http://localhost:5173 and sign in with GitHub or Google.

## Vault backends

NoteKit stores all your notes, tickets, and links as files in a Git repo. Two backends are supported and have feature parity for every operation that matters:

| Capability | **GitHub** | **NoteKit-hosted** (Forgejo) |
|---|---|---|
| File CRUD (notes, tickets, links, attachments) | ✅ | ✅ |
| Commit history + attribution | ✅ | ✅ |
| Real-time cross-device sync (SSE) | ✅ | ✅ |
| Cross-vault import / migration | ✅ | ✅ |
| Vault sharing (collaborators) | ✅ pending invitations | ✅ immediate access |
| End-to-end encryption | ✅ (client-side, vault-agnostic) | ✅ (client-side, vault-agnostic) |
| Agent profiles | ✅ | ✅ |
| Where the data lives | github.com | Your Forgejo instance |
| Who pays for storage | You (GitHub account quota) | NoteKit (subject to per-user quota — 100 MB free, 1 GB Plus) |
| Lock-in | None — your repo, your files | None — Forgejo is OSS; `notekit vault migrate` moves you out anytime |

The two are interchangeable. You can register multiple vaults of either kind, migrate freely between them with `notekit vault migrate --from <id> --to <id>`, and every client (web, desktop, mobile, CLI, MCP) treats them identically.

See [`docs/architecture/vaults.md`](docs/architecture/vaults.md) for the dispatcher pattern that makes this work.

## Repo layout

```
packages/
  core/         shared TS + React + stores + editor + auth hook
  api-client/   typed HTTP wrapper around @notekit/api (consumed by every client)
apps/
  api/          Hono API server (auth, sessions, sync orchestration)  [AGPL]
  web/          Vite web app                                          [MIT]
  mobile/       Capacitor wrapper of apps/web for iOS + Android       [MIT]
  desktop/      Electron wrapper of apps/web for macOS/Win/Linux      [MIT]
  cli/          Node CLI hitting the API                              [MIT]
  mcp/          MCP server exposing notes/tickets to Claude/Cursor    [AGPL]
docs/           product, business, architecture, and growth docs
```

## Docs

- [PRD](docs/PRD.md) — product requirements
- [PLAN](docs/PLAN.md) — architecture + milestones
- [BUSINESS](docs/BUSINESS.md) — pricing, GTM, financials
- [COMPETITORS](docs/COMPETITORS.md) — competitive landscape
- [PLAYBOOK](docs/PLAYBOOK.md) — beginner founder growth + monetization guide

## License

Clients (web/desktop/mobile/CLI/extension): **MIT**. Server (`@notekit/api`, `@notekit/mcp`): **AGPL-3.0**. Infra configs: **MIT**.
