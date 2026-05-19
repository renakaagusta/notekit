# @notekit/desktop

MIT-licensed Electron wrapper around the `@notekit/web` build. The web
bundle does all the UI; this app adds OS-level integrations (keychain,
external links, auto-update) and the usual Electron lifecycle plumbing.

## Run in development

```bash
pnpm --filter @notekit/desktop dev
```

This spawns the Vite dev server (`@notekit/web` on
[http://localhost:5173](http://localhost:5173)) and then launches Electron
against it once the port is up. Hot reload comes from Vite; main/preload
changes require a restart.

## Build production installers

```bash
pnpm --filter @notekit/desktop build
```

That runs the web build, compiles `src/*.ts` to `dist/`, then invokes
`electron-builder` per `electron-builder.yml`. Outputs land in `out/`.

| Target | Format |
| ------ | ------ |
| macOS  | `.dmg` (x64 + arm64) |
| Windows | `.exe` NSIS installer (x64) |
| Linux  | `.AppImage` and `.deb` (x64) |

## Keychain location per OS

`window.notekit.keychain.*` uses [@napi-rs/keyring], which writes to the
platform's native secret store under service id `com.notekit.desktop`. Same
library the NoteKit CLI uses, so a future "share token between desktop and
CLI" gesture won't need a second library.

- **macOS** — Keychain Access app, item kind "application password".
- **Windows** — Credential Manager > Windows Credentials > Generic
  Credentials, prefixed with `com.notekit.desktop`.
- **Linux** — `libsecret` (GNOME Keyring, KWallet, etc). The N-API prebuilds
  link against the system `libsecret`, so `libsecret-1-0` must be installed
  at runtime (`apt install libsecret-1-0`). No `*-dev` package needed at
  build time.

[@napi-rs/keyring]: https://github.com/napi-rs/node-keyring

## TODOs before shipping

- **Code signing**: `electron-builder.yml` leaves macOS/Windows signing
  unconfigured. For macOS, set `CSC_LINK` + `CSC_KEY_PASSWORD` in CI and
  add a Developer ID to the `mac:` block. For Windows, sign with an EV
  certificate via `CSC_LINK`/`CSC_KEY_PASSWORD` or a hardware token.
- **Auto-update**: replace `TODO-github-owner` / `TODO-github-repo` in
  `electron-builder.yml` with the real GitHub repo before running
  `electron-builder --publish always`. `electron-updater` reads the same
  config at runtime.
- **Notarization** (macOS): add `afterSign` hook with `@electron/notarize`
  once Apple credentials exist.
