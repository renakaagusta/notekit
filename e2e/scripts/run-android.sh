#!/usr/bin/env bash
# Wrapper: build the APK, install on the first connected device or boot
# the configured emulator, `adb reverse` for host API access, run flows.
#
# On real Android devices (especially Android 16+), `pm clear` is blocked
# for ADB-installed packages. We work around it by uninstall+reinstall
# between flows, which resets app state, localStorage, and keychain.
#
# Override the device with ANDROID_SERIAL; override the AVD via ANDROID_AVD.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
EMU="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"

# JDK 21 — Capacitor 7's Gradle needs it. macOS users often have only
# JDK 17 on PATH; the Android Studio Lady Bug bundle ships JDK 21.
if [[ -z "${JAVA_HOME:-}" ]] && [[ -d "/Applications/Android Studio Lady Bug.app/Contents/jbr/Contents/Home" ]]; then
  export JAVA_HOME="/Applications/Android Studio Lady Bug.app/Contents/jbr/Contents/Home"
fi

# ── env ──────────────────────────────────────────────────────────────────
if [[ -f e2e/.env ]]; then
  # shellcheck disable=SC1091
  set -a; source e2e/.env; set +a
fi

if [[ -z "${E2E_PAT:-}" ]]; then
  echo "✗ E2E_PAT not set. Copy e2e/.env.example to e2e/.env and mint a token." >&2
  exit 1
fi

# ── pick device ──────────────────────────────────────────────────────────
SERIAL="${ANDROID_SERIAL:-}"
if [[ -z "$SERIAL" ]]; then
  SERIAL="$("$ADB" devices | awk '/device$/ {print $1; exit}')"
fi
if [[ -z "$SERIAL" ]]; then
  AVD="${ANDROID_AVD:-Pixel_6a_API_35}"
  echo "→ no device; booting AVD $AVD"
  "$EMU" -avd "$AVD" -no-snapshot-save -no-boot-anim &> /tmp/nk-emu.log &
  echo "  waiting for emu (up to 90s)…"
  for _ in $(seq 1 90); do
    sleep 1
    if "$ADB" shell getprop sys.boot_completed 2>/dev/null | grep -q "^1"; then
      echo "  emu ready"
      SERIAL="$("$ADB" devices | awk '/device$/ {print $1; exit}')"
      break
    fi
  done
fi
echo "→ using device $SERIAL"

# ── build APK ────────────────────────────────────────────────────────────
API_URL="${E2E_API_URL:-http://localhost:3001}"
echo "→ building web with VITE_API_URL=$API_URL (VITE_DEBUG=true for the PAT sign-in path)"
VITE_DEBUG=true VITE_API_URL="$API_URL" pnpm --filter @notekit/web build

echo "→ cap copy android"
(cd apps/mobile && pnpm exec cap copy android)

# Replay our native-project deltas (network_security_config). Idempotent.
bash "$REPO_ROOT/e2e/scripts/apply-patches.sh"

echo "→ gradle assembleDebug"
(cd apps/mobile/android && ./gradlew assembleDebug --console=plain | tail -3)

APK="$REPO_ROOT/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"

# ── adb reverse so device's localhost:3001 → host's localhost:3001 ───────
"$ADB" -s "$SERIAL" reverse tcp:3001 tcp:3001

# ── helpers ──────────────────────────────────────────────────────────────
reset_app() {
  "$ADB" -s "$SERIAL" uninstall com.notekit.app >/dev/null 2>&1 || true
  "$ADB" -s "$SERIAL" install -r "$APK" >/dev/null
  # Re-adding reverse — survives uninstall but new install can race.
  "$ADB" -s "$SERIAL" reverse tcp:3001 tcp:3001 >/dev/null
}

# ── run flows sequentially with fresh install before each ────────────────
mkdir -p "$REPO_ROOT/e2e/artifacts"
cd "$REPO_ROOT/e2e/maestro"

PASS=0
FAIL=0
FAILED_FLOWS=()

for flow in 01-shell-smoke.yml 02-signin-pat.yml 03-note-crud.yml 04-sync.yml; do
  echo
  echo "──────────────────────────────────────────────"
  echo "  Running $flow (with fresh install)"
  echo "──────────────────────────────────────────────"
  reset_app
  if maestro --device "$SERIAL" test -e E2E_PAT="$E2E_PAT" "$flow"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILED_FLOWS+=("$flow")
  fi
done

echo
echo "══════════════════════════════════════════════"
echo "  SUMMARY: $PASS passed, $FAIL failed"
if (( FAIL > 0 )); then
  echo "  Failed flows:"
  for f in "${FAILED_FLOWS[@]}"; do
    echo "    - $f"
  done
fi
echo "══════════════════════════════════════════════"

(( FAIL == 0 )) || exit 1
