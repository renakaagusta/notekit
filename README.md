# NoteKit

> Notes + tickets in your Git repo. Open source. MCP-first. $1.49/mo for managed hosting.

NoteKit is a notes and tickets application that stores everything in a real Git repository — your repo, your files. Connect it to your own GitHub, or use our free hosted Git server (Forgejo). Everything works offline-first, syncs through the Git protocol, and exposes your knowledge to Claude/Cursor via the Model Context Protocol.

## Status

**Pre-alpha — under active development.** See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap.

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

## Repo layout

```
packages/
  core/         shared TS + React + stores + editor + auth hook
  web/          Vite web app
apps/
  api/          Hono API server (auth, sessions, sync orchestration)
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
