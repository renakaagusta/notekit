# @notekit/cli

`notekit` — NoteKit's terminal client. Create and edit notes, manage tickets,
switch vaults, and run the MCP server, all from your shell.

> Status: usable. `notekit auth login` runs a PKCE-style loopback flow
> against the API's `/auth/cli/*` endpoints; `--token <t>` remains as a
> paste-path for scripts.

## Install

```sh
# placeholder — not published yet
npm i -g notekit-cli
```

Local development inside the monorepo:

```sh
pnpm install
pnpm --filter @notekit/cli dev -- --help
```

## Quick start

```sh
notekit auth login --token "$NOTEKIT_TOKEN"
notekit vault list
notekit vault switch <id>
notekit note new "Buy oat milk"
notekit ticket new "Fix sync bug" --priority high
notekit ticket list
```

## Config

`notekit` keeps non-secret settings in
`$XDG_CONFIG_HOME/notekit/config.json` (falls back to
`~/.config/notekit/config.json`). The bearer token is stored in your OS
keychain (Keychain Access on macOS, libsecret on Linux, Credential Manager
on Windows) under the service name `notekit-cli`.

| Key              | Default                  | Purpose                       |
| ---------------- | ------------------------ | ----------------------------- |
| `apiUrl`         | `http://localhost:3001`  | NoteKit API base URL          |
| `currentVaultId` | (none)                   | Active vault id               |
| `userId`         | (none)                   | Cached from `/auth/me`        |
| `email`          | (none)                   | Cached from `/auth/me`        |

Edit the file directly to point at a remote API, or set
`XDG_CONFIG_HOME=/tmp/foo` to sandbox the CLI for testing.

## Commands

Run `notekit --help` (or `notekit <group> --help`) for the up-to-date list.

- `notekit auth login | logout | whoami`
- `notekit note new | list | read | edit | rm | search`
- `notekit ticket new | list | show | close | reopen | assign`
- `notekit vault list | switch | sync | members`
- `notekit mcp serve [--sse --port <n>]`
- `notekit upgrade [--open]`

## License

MIT.
