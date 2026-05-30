#!/usr/bin/env bash
# Build the iOS .app from a freshly synced Capacitor web bundle, install it
# on the currently booted simulator. Idempotent — re-run after any change in
# packages/core, apps/web, or apps/mobile/ios.
#
# Assumes a simulator is already booted (`xcrun simctl boot <udid>`).
# The script does not boot one because picking which sim is a per-user
# decision; the e2e/scripts/run-ios.sh wrapper handles that.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

API_URL="${E2E_API_URL:-http://localhost:3001}"
echo "→ building web with VITE_API_URL=$API_URL (VITE_DEBUG=true for the PAT sign-in path)"
VITE_DEBUG=true VITE_API_URL="$API_URL" pnpm --filter @notekit/web build

echo "→ cap copy ios"
(cd apps/mobile && pnpm exec cap copy ios)

# Replay our native-project deltas (ATS exception). Idempotent.
bash "$REPO_ROOT/e2e/scripts/apply-patches.sh"

echo "→ xcodebuild (Debug, simulator, no signing)"
cd apps/mobile/ios/App
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -derivedDataPath build \
  -arch arm64 \
  CODE_SIGNING_ALLOWED=NO \
  -quiet \
  | tail -5

APP_PATH="$REPO_ROOT/apps/mobile/ios/App/build/Build/Products/Debug-iphonesimulator/App.app"
echo "→ installing $APP_PATH"
xcrun simctl uninstall booted com.notekit.app 2>/dev/null || true
xcrun simctl install booted "$APP_PATH"

echo "✓ installed; app id com.notekit.app"
