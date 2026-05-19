# @notekit/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
your NoteKit notes, tickets, and vault to MCP-compatible LLM clients —
Claude Desktop, Cursor, Zed, Continue, and so on.

Built on the official [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

## What it exposes

### Tools

| Tool             | Purpose                                                     |
|------------------|-------------------------------------------------------------|
| `vault_list`     | List vaults the user can access; mark the selected one.     |
| `vault_select`   | Switch the active vault.                                    |
| `notes_search`   | Substring search across note title, tags, and body.         |
| `notes_read`     | Read one note's frontmatter and Markdown body.              |
| `notes_create`   | Create a new note (commits to Git).                         |
| `notes_update`   | Update a note's body and/or frontmatter (commits to Git).   |
| `tickets_list`   | List tickets with optional `status`/`priority`/`assignee`.  |
| `tickets_create` | Open a new ticket.                                          |
| `tickets_update` | Move tickets between statuses, reassign, edit body.         |

### Resources

| Scheme      | URI shape                                | Description                          |
|-------------|------------------------------------------|--------------------------------------|
| `note://`   | `note://<vaultId>/<urlEncodedPath>`      | Markdown notes in the selected vault. |
| `ticket://` | `ticket://<vaultId>/<urlEncodedPath>`    | Markdown tickets in the selected vault. |

## Install (from the monorepo)

```bash
pnpm install
pnpm --filter @notekit/mcp build
```

This produces `apps/mcp/dist/index.js` and the `notekit-mcp` bin shim.

## Configure for Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) and add:

```json
{
  "mcpServers": {
    "notekit": {
      "command": "node",
      "args": [
        "/absolute/path/to/notekit/apps/mcp/dist/index.js"
      ],
      "env": {
        "NOTEKIT_API_URL": "http://localhost:3001",
        "NOTEKIT_TOKEN": "paste-your-token-here"
      }
    }
  }
}
```

Restart Claude Desktop. You should see the NoteKit tools appear in the
hammer icon.

If you've published the package and want to run via `npx`, swap the command:

```json
"command": "npx",
"args": ["-y", "@notekit/mcp"]
```

## Configure for Cursor / Zed / Continue

These clients accept the same shape — point them at `node dist/index.js`
with `NOTEKIT_API_URL` and `NOTEKIT_TOKEN` in the env block.

## SSE / remote transport

```bash
NOTEKIT_TOKEN=... node dist/index.js --sse --port 3030
```

Clients connect to `http://localhost:3030/sse`. The server also exposes
`/healthz` for liveness checks.

## Getting a token

> TODO: Phase 2 ships `/auth/tokens` in the NoteKit API and a Settings →
> Tokens page in the web app to mint scoped MCP tokens. Until then, reuse
> your session bearer token from the web app's network inspector.

## Development

```bash
NOTEKIT_TOKEN=... pnpm --filter @notekit/mcp dev      # tsx watch
pnpm --filter @notekit/mcp typecheck
pnpm --filter @notekit/mcp build
```

## License

AGPL-3.0-only. Self-hosting and modification are allowed; redistributing
modified versions (including running this server as a hosted service)
requires sharing the source under AGPL. See the root [README](../../README.md)
for NoteKit's broader licensing model.
