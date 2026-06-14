#!/usr/bin/env bash
#
# Guard: after `cap sync`, assert the synced iOS/Android web bundles contain
# the expected API URL. Mirrors the post-build check in apps/web/Dockerfile so
# a stale/localhost `.env.production` (or a broken Vite substitution) can't ship
# a bundle that calls localhost — invisible until a device can't reach the
# server. See issue #35.
#
# Usage:
#   VITE_API_URL=https://api.notekit.online bash scripts/assert-bundle-url.sh
# Defaults to the prod URL when VITE_API_URL is unset.
set -euo pipefail

EXPECTED="${VITE_API_URL:-https://api.notekit.online}"
cd "$(dirname "$0")/.."

echo "Asserting mobile bundles target API URL: $EXPECTED"
status=0
checked=0

assert_bundle() {
  local label="$1" glob="$2"
  if compgen -G "$glob" >/dev/null; then
    checked=1
    if grep -qF "$EXPECTED" $glob; then
      echo "  $label ✓ ($EXPECTED present)"
    else
      echo "  $label ✗ MISSING $EXPECTED"
      status=1
    fi
  else
    echo "  $label — no bundle found (skipped; run cap sync first)"
  fi
}

assert_bundle "iOS    " "ios/App/App/public/assets/index-*.js"
assert_bundle "Android" "android/app/src/main/assets/public/assets/index-*.js"

if [ "$checked" = 0 ]; then
  echo "ERROR: no synced bundles found — did 'cap sync' run?" >&2
  exit 1
fi
if [ "$status" != 0 ]; then
  echo "ERROR: a mobile bundle does not target $EXPECTED." >&2
  echo "Likely a stale/localhost apps/web/.env.production, or api.ts using" >&2
  echo "indirect import.meta.env access that defeats Vite substitution." >&2
  echo "Refusing to ship a bundle that can't reach the server." >&2
  exit 1
fi
echo "OK — bundles target $EXPECTED"
