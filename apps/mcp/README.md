# @notekit/mcp

> A [Model Context Protocol](https://modelcontextprotocol.io) server that
> exposes your NoteKit notes, tickets, and project-scoped memory to every
> major agent IDE — Claude Code, Cursor, Codex, OpenCode, Continue, Zed,
> Windsurf, and Claude Desktop.

Built on the official [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).
Git-backed, project-aware, ticket-aware, and E2EE-aware — every write is a
real commit to your repo, scoped automatically to the project you're
working in.

---

## Quickstart

```bash
# Install the single self-contained binary (no Node, no npm):
curl -fsSL https://raw.githubusercontent.com/renakaagusta/notekit/main/scripts/install.sh | sh

# Then in any supported IDE:
notekit mcp install cursor          # or claude-code, codex, opencode, …
```

The same `notekit` binary is both the CLI and the MCP server — `notekit
mcp serve` runs the MCP transport in-process. The installer writes
`command: <absolute path to notekit>` + `args: ["mcp", "serve"]` into the
IDE's config.

If you'd rather not run a one-line shell installer, download the right
binary for your platform from the [latest GitHub
Release](https://github.com/renakaagusta/notekit/releases/latest),
verify the SHA256, drop it in `~/.local/bin/notekit`, and chmod +x.

To diagnose a misbehaving setup:

```bash
notekit mcp doctor
```

## Why a binary instead of npm

NoteKit ships as a Bun-compiled standalone executable rather than as an
`@notekit/mcp` npm package, because:

- **No Node.js dependency on the user side.** The Bun runtime is
  embedded in the ~63 MB binary.
- **~20ms cold start** vs ~3–5s for `npx -y` (which resolves and
  downloads on every invocation).
- **No registry account on our side.** Distribution lives entirely on
  GitHub Releases — no npm.com signup, no JSR account, no CAPTCHA loops.
- **One binary, many subcommands.** Same `notekit` runs `auth login`,
  `vault list`, `note new`, `mcp serve`, and `mcp install`. No
  separate-tool sprawl.

When the npm path becomes viable, `notekit mcp install <client>
--use-npx` will emit `npx -y @notekit/mcp` style configs as a fallback.

## How project scoping works

NoteKit MCP knows which project you're working on by looking for a
`.notekit` marker walking up from the IDE's cwd. The marker is one line:

```
project: notekit
```

The MCP server then resolves tool paths against `projects/<slug>/` inside
your active vault, with read-everywhere / write-locally semantics — your
agent can search both the project folder and global notes, but new files
land inside the project folder.

You almost never write this file by hand. The `project_create` MCP tool
auto-derives the slug from `git remote get-url origin`, scaffolds the
vault folder, and drops the marker on the first call inside a fresh repo.

| Marker absent | Marker present |
|---|---|
| Tools default to `scope: "all"` — every project + global. | Tools default to `scope: "project"` — that project, fallback to global. |
| `project_create` proposes a slug derived from cwd. | `project_current` returns the resolved slug + marker location. |

You can also override per-call: every notes/tickets tool accepts
`scope: "project" | "global" | "all"` and `project: "<slug>"`.

## Tools

Every tool below carries MCP annotations (`readOnlyHint` / `destructiveHint` /
`idempotentHint`) so agent IDEs render the right permission prompt before
the agent runs them.

### Project

| Tool              | Purpose                                                    |
|-------------------|------------------------------------------------------------|
| `project_list`    | List every `projects/<slug>/` defined in the active vault. |
| `project_current` | What project (if any) the MCP resolved from cwd.           |
| `project_create`  | Bootstrap a project + `.notekit` marker. Idempotent.       |

### Vault

| Tool             | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `vault_list`     | List vaults the user can access; mark the selected one.     |
| `vault_select`   | Switch the active vault.                                    |

### Notes

| Tool             | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `notes_search`   | Substring search across note title, tags, and body. Scope-aware. |
| `notes_read`     | Read one note's frontmatter and Markdown body.              |
| `notes_create`   | Create a new note (commits to Git). Defaults path to the active scope. |
| `notes_update`   | Update a note's body and/or frontmatter (commits to Git).   |
| `notes_append`   | Append Markdown to an existing note without re-reading it.  |
| `notes_move`     | Move / rename a note (write new path, delete old; two commits). |
| `notes_delete`   | Delete a note (commits the removal; stays in Git history).  |

### Tickets

| Tool             | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `tickets_list`   | List tickets with optional `status`/`priority`/`assignee`. Scope-aware. |
| `tickets_create` | Open a new ticket.                                          |
| `tickets_update` | Move tickets between statuses, reassign, edit body.         |
| `tickets_delete` | Delete a ticket entirely (use `tickets_update` with `archived` to soft-close). |

### Inbox

| Tool             | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `inbox_append`   | Capture a chunk of text into today's inbox file (project-scoped). |

### Links

| Tool             | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `links_list`     | List saved links in the active scope, optional tag filter.  |
| `links_create`   | Save a URL with title/description/tags. Detects platform.   |

### Discovery

| Tool             | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `recent_activity`| List recent Git commits in the active vault, scoped by project. |
| `vault_grep`     | Regex / substring search across notes, tickets, links, inbox. |
| `list_directory` | List immediate children of a vault path (folders + files).  |

### Secrets

| Tool                  | Purpose                                       |
|-----------------------|-----------------------------------------------|
| `secrets_*` (multiple)| Read scoped secrets from the user's vault.    |

## Prompts (slash commands)

Show up as `/notekit:*` in clients that support MCP prompts (Claude Code,
Cursor, Zed, …):

| Prompt                  | Purpose                                                  |
|-------------------------|----------------------------------------------------------|
| `/notekit:daily`        | Open or create today's daily note + guide a journal flow. |
| `/notekit:capture`      | Drop a chunk of text into today's inbox for later triage. |
| `/notekit:ticket-triage`| Walk through open tickets in the active project.         |

## Resources

| Scheme      | URI shape                                | Description                          |
|-------------|------------------------------------------|--------------------------------------|
| `note://`   | `note://<vaultId>/<urlEncodedPath>`      | Markdown notes in the selected vault. |
| `ticket://` | `ticket://<vaultId>/<urlEncodedPath>`    | Markdown tickets in the selected vault. |

## Per-client install recipes

> Just run `notekit mcp install <client>` — it writes exactly the
> blocks below, with the absolute path of your installed `notekit`
> binary substituted in. The samples here use `~/.local/bin/notekit` as
> a placeholder; replace it with `which notekit` output.

### Claude Code

```bash
claude mcp add notekit -- ~/.local/bin/notekit mcp serve
```

Or `~/.claude.json`:

```json
{
  "mcpServers": {
    "notekit": {
      "command": "/Users/me/.local/bin/notekit",
      "args": ["mcp", "serve"],
      "env": { "NOTEKIT_API_URL": "http://localhost:3001", "NOTEKIT_TOKEN": "nkp_…" }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` for project-scoped):

```json
{
  "mcpServers": {
    "notekit": {
      "command": "/Users/me/.local/bin/notekit",
      "args": ["mcp", "serve"],
      "env": { "NOTEKIT_API_URL": "http://localhost:3001", "NOTEKIT_TOKEN": "nkp_…" }
    }
  }
}
```

Or use the [deeplink](https://cursor.com/docs/mcp) that `notekit mcp install cursor` prints.

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.notekit]
command = "/Users/me/.local/bin/notekit"
args = ["mcp", "serve"]

[mcp_servers.notekit.env]
NOTEKIT_API_URL = "http://localhost:3001"
NOTEKIT_TOKEN = "nkp_…"
```

### OpenCode

`opencode.json` (project) or `~/.config/opencode/opencode.json` (global):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "notekit": {
      "type": "local",
      "command": ["/Users/me/.local/bin/notekit", "mcp", "serve"],
      "enabled": true,
      "environment": { "NOTEKIT_API_URL": "…", "NOTEKIT_TOKEN": "…" }
    }
  }
}
```

### Continue

`~/.continue/config.json` (or `.continue/config.json`):

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "name": "notekit",
        "transport": {
          "type": "stdio",
          "command": "/Users/me/.local/bin/notekit",
          "args": ["mcp", "serve"],
          "env": { "NOTEKIT_API_URL": "…", "NOTEKIT_TOKEN": "…" }
        }
      }
    ]
  }
}
```

### Zed

`~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "notekit": {
      "command": {
        "path": "/Users/me/.local/bin/notekit",
        "args": ["mcp", "serve"],
        "env": { "NOTEKIT_API_URL": "…", "NOTEKIT_TOKEN": "…" }
      }
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "notekit": {
      "command": "/Users/me/.local/bin/notekit",
      "args": ["mcp", "serve"],
      "env": { "NOTEKIT_API_URL": "…", "NOTEKIT_TOKEN": "…" }
    }
  }
}
```

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "notekit": {
      "command": "/Users/me/.local/bin/notekit",
      "args": ["mcp", "serve"],
      "env": { "NOTEKIT_API_URL": "…", "NOTEKIT_TOKEN": "…" }
    }
  }
}
```

## Getting a NOTEKIT_TOKEN

1. Sign in to the NoteKit web app and open Settings → API tokens.
2. Mint a scoped token. The CLI also stores it in the OS keychain:
   `notekit auth login` then `notekit mcp install <client> --inline-token`.

## SSE / remote transport

```bash
NOTEKIT_TOKEN=… npx -y @notekit/mcp --sse --port 3030
```

The server binds to `127.0.0.1` by default and enforces a bearer header on
both `/sse` and `/messages`. Clients connect to `http://localhost:3030/sse`
with `Authorization: Bearer <NOTEKIT_TOKEN>`.

## Development

```bash
pnpm --filter @notekit/mcp dev          # tsx watch
pnpm --filter @notekit/mcp typecheck
pnpm --filter @notekit/mcp test
pnpm --filter @notekit/mcp build
```

## License

AGPL-3.0-only. See [LICENSE](./LICENSE). Self-hosting and modification are
allowed; redistributing modified versions (including running this server
as a hosted service) requires sharing the source under AGPL. See the root
[README](../../README.md) for NoteKit's broader licensing model.
