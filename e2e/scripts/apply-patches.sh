#!/usr/bin/env bash
# Overlay the native-project patches in e2e/patches/ onto the generated
# Capacitor projects in apps/mobile/{ios,android}/.
#
# Why patches instead of editing the projects in place?
#   - The native projects are .gitignored (each contributor regenerates
#     them with `cap add ios` / `cap add android`).
#   - Capacitor sometimes rewrites these files on `cap sync`.
#   - Patches keep our deltas (ATS exception, Android cleartext config)
#     reviewable and replayable.
#
# Idempotent — re-run safely.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PATCHES="$REPO_ROOT/e2e/patches"
MOBILE="$REPO_ROOT/apps/mobile"

[[ -d "$MOBILE/ios" ]] && {
  echo "→ patching iOS Info.plist (ATS exception for localhost)"
  cp "$PATCHES/ios/App/App/Info.plist" "$MOBILE/ios/App/App/Info.plist"
}

[[ -d "$MOBILE/android" ]] && {
  echo "→ patching Android manifest + network_security_config (cleartext for localhost)"
  cp "$PATCHES/android/app/src/main/AndroidManifest.xml" \
     "$MOBILE/android/app/src/main/AndroidManifest.xml"
  mkdir -p "$MOBILE/android/app/src/main/res/xml"
  cp "$PATCHES/android/app/src/main/res/xml/network_security_config.xml" \
     "$MOBILE/android/app/src/main/res/xml/network_security_config.xml"
}

echo "✓ patches applied"
