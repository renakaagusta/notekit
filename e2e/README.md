# NoteKit mobile E2E (Maestro)

End-to-end tests for the Capacitor-wrapped mobile app, driven by
[Maestro](https://maestro.mobile.dev). The same flow files run on the
iOS simulator (`xcrun simctl`) and on Android (emulator or real device
over `adb`).

## What's covered

| Flow                | Status   | What it verifies                                  |
| ------------------- | -------- | ------------------------------------------------- |
| `01-shell-smoke`    | full     | Cold launch + sign-in screen + OAuth buttons + PAT trigger render. |
| `02-signin-pat`     | full     | PAT-based sign-in resolves to authenticated state. |
| `03-note-crud`      | minimal  | Auth → empty notes view. CRUD is gated on the mobile shell rendering fix (see Known Issues). |
| `04-sync`           | minimal  | Auth → empty notes view. Sync UI is gated on the hamburger drawer being reachable. |

OAuth (GitHub / Google) is deliberately *not* tested end-to-end —
Google's WebView detection breaks deterministically in any simulator
or emulator. The PAT path covers everything downstream of auth.

## Prerequisites

- **macOS** with **Xcode** + an iOS simulator (iPhone 17 Pro on iOS 26.3
  is the default in `run-ios.sh`; override via `IOS_SIM_UDID`).
- **Android Studio** with the SDK installed at `~/Library/Android/sdk`.
  Either an AVD (default `Pixel_6a_API_35`) or a real device connected
  via `adb` works. JDK 21 must be available; the wrapper picks it up
  from the Android Studio Lady Bug bundle automatically.
- **`maestro` CLI ≥ 2.0** (`curl -fsSL "https://get.maestro.mobile.dev" | bash`).
- **A running NoteKit API.** Local dev (`pnpm --filter @notekit/api dev`)
  is the default; the `.env` file in this folder can point at any
  reachable instance.
- **A NoteKit PAT** for an account with at least one vault configured.
  See `.env.example` for how to mint one.

## Setup

```bash
cp e2e/.env.example e2e/.env
# edit e2e/.env — set E2E_PAT and (optionally) E2E_API_URL
```

The PAT is read from the OS shell env (via Maestro `runScript`, see
`e2e/scripts/read-pat.js`) rather than `${VAR}` interpolation, which
was inconsistent in Maestro 2.1 inside `inputText`.

## Run

```bash
# iOS — boots a sim if none is booted, rebuilds, runs flows sequentially
bash e2e/scripts/run-ios.sh

# Android — uses first connected device, falls back to emulator
bash e2e/scripts/run-android.sh
```

Flows run **sequentially** (not Maestro's default parallel) because a
single simulator/device can't service overlapping `launchApp` +
`clearState` commands without races.

Artifacts (screenshots, JUnit reports) land in `e2e/artifacts/`.

## How the PAT path works

OAuth inside a Capacitor WebView is unreliable. Instead,
`packages/core/src/components/SignIn.tsx` shows a "Sign in with token"
affordance when `Capacitor.isNativePlatform() === true`. The user (or
Maestro) pastes a PAT; the form writes it to
`localStorage["notekit:e2e-pat"]` and reloads. On the next boot,
`packages/core/src/lib/api.ts` constructs the API client in bearer
mode using that token — the same model the CLI and desktop already use.

## State reset between flows

- **iOS**: Maestro's `launchApp: { clearState: true }` works and wipes
  the WebView's localStorage + cookies.
- **Android**: real devices on Android 16+ block `pm clear` for
  ADB-installed packages with a `SecurityException`. The wrapper script
  uninstalls + reinstalls the APK between flows to achieve the same
  effect. Add ~3 s overhead per flow.

## Hitting prod vs local

Local API (default) lets the flows run hermetically without touching
prod data. To run against the deployed API:

1. **On the server**, set
   `CORS_EXTRA_ORIGINS=capacitor://localhost,https://localhost` in the
   environment and redeploy. Without this the WebView's fetch calls get
   rejected by CORS preflight (the only allowed origin is `WEB_URL`).
2. **In `e2e/.env`**, set `E2E_API_URL=https://notekit-api.stackbase.id`.
3. **Mint a PAT** against prod (Settings → Personal access tokens) and
   put it in `E2E_PAT`.
4. Re-run `bash e2e/scripts/run-ios.sh` (or `run-android.sh`). The flow
   files don't change between local and prod targets.

## Known issues

- **Mobile shell rendering is broken in the Capacitor build.** Post-auth,
  the iOS and Android builds show only the empty notes hint text — no
  hamburger drawer, no header, no "+ New" button, no toolbar. The
  desktop layout's "Press ⌘N to create one." copy renders even though
  `useMediaQuery(MOBILE_BREAKPOINT)` should flip to the mobile shell
  at the 720px breakpoint. Until this is fixed, flows 03 and 04 only
  assert the authenticated state. Tracked separately.

- **Maestro 2.1 `${ENV}` substitution.** In some versions, environment
  variables passed via `-e KEY=VAL` aren't substituted inside the `text`
  argument of `inputText`. The flows route the PAT through
  `runScript` → `output.pat` → `${output.pat}` to dodge this.
