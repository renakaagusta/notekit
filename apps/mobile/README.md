# @notekit/mobile

Capacitor wrapper that ships the `@notekit/web` Vite build as a native iOS + Android app.

## Prereqs (manual — install once)

- **Xcode** 15+ (Mac only) — `xcode-select --install` then install from App Store.
- **Android Studio** with SDK + emulator — https://developer.android.com/studio.
- **CocoaPods** — `sudo gem install cocoapods`.
- **Apple Developer Program** — $99/yr at https://developer.apple.com.
- **Google Play Console** — $25 one-time at https://play.google.com/console.

## First-time setup

```bash
# From repo root
pnpm install

# Generate iOS + Android platform folders. Run once. Commits the platforms/.
pnpm --filter @notekit/mobile add:ios
pnpm --filter @notekit/mobile add:android

# Open the projects in their native IDEs to set Team ID + signing.
pnpm --filter @notekit/mobile ios       # Xcode opens
pnpm --filter @notekit/mobile android   # Android Studio opens
```

In **Xcode**:
- Select the project → Signing & Capabilities → set your Apple Team
- Capabilities → enable **Push Notifications** and **Background Modes → Remote notifications**
- General → Bundle Identifier: must match `APNS_BUNDLE_ID` in the API `.env`

In **Android Studio**:
- Drop your `google-services.json` (from Firebase console) into `apps/mobile/android/app/`
- Run **Build → Generate Signed Bundle / APK** for release

## Day-to-day

```bash
pnpm --filter @notekit/mobile sync      # rebuild web + copy to native
pnpm --filter @notekit/mobile ios       # open Xcode → run
pnpm --filter @notekit/mobile android   # open Android Studio → run
```

## OAuth in the native app

Web OAuth redirects don't survive in a webview. The app uses `@capacitor/browser`
to open Google/GitHub OAuth in the system browser, with a custom URL scheme
(`notekit://auth/callback`) registered to bring the user back into the app.

See `packages/core/src/lib/auth-native.ts` and the deep link config in
`apps/mobile/ios/App/App/Info.plist` (generated after `add:ios`).
