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

  echo "→ patching iOS app icon (monochrome AppIcon.appiconset)"
  ICONSET="App/App/Assets.xcassets/AppIcon.appiconset"
  mkdir -p "$MOBILE/ios/$ICONSET"
  # Wipe the old (Capacitor default) entries before overlaying — a smaller
  # incoming set would otherwise leave stale PNGs the new Contents.json no
  # longer references, which Xcode warns on.
  rm -f "$MOBILE/ios/$ICONSET"/*.png "$MOBILE/ios/$ICONSET/Contents.json"
  cp "$PATCHES/ios/$ICONSET"/*.png "$MOBILE/ios/$ICONSET"/
  cp "$PATCHES/ios/$ICONSET/Contents.json" "$MOBILE/ios/$ICONSET/Contents.json"
}

[[ -d "$MOBILE/android" ]] && {
  echo "→ patching Android manifest + network_security_config (cleartext for localhost)"
  cp "$PATCHES/android/app/src/main/AndroidManifest.xml" \
     "$MOBILE/android/app/src/main/AndroidManifest.xml"
  mkdir -p "$MOBILE/android/app/src/main/res/xml"
  cp "$PATCHES/android/app/src/main/res/xml/network_security_config.xml" \
     "$MOBILE/android/app/src/main/res/xml/network_security_config.xml"

  echo "→ patching Android launcher icons (monochrome mipmaps + adaptive bg)"
  RES="app/src/main/res"
  for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    mkdir -p "$MOBILE/android/$RES/mipmap-$d"
    cp "$PATCHES/android/$RES/mipmap-$d"/*.png \
       "$MOBILE/android/$RES/mipmap-$d"/
  done
  mkdir -p "$MOBILE/android/$RES/values"
  cp "$PATCHES/android/$RES/values/ic_launcher_background.xml" \
     "$MOBILE/android/$RES/values/ic_launcher_background.xml"
}

echo "✓ patches applied"
