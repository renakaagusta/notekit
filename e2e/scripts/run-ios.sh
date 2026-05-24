#!/usr/bin/env bash
# Wrapper: boot an iOS simulator if needed, rebuild + install the app,
# then run each Maestro flow sequentially.
#
# Maestro defaults to parallel flow execution within a single `maestro test`
# invocation, which races against the single simulator (multiple clearState
# calls, overlapping launches → "App crashed or stopped"). We run flows one
# at a time and aggregate the results ourselves.
#
# Override the sim by setting IOS_SIM_UDID; otherwise picks the first
# booted iPhone, falling back to iPhone 17 Pro on iOS 26.3.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

# ── env ──────────────────────────────────────────────────────────────────
if [[ -f e2e/.env ]]; then
  # shellcheck disable=SC1091
  set -a; source e2e/.env; set +a
fi

if [[ -z "${E2E_PAT:-}" ]]; then
  echo "✗ E2E_PAT not set. Copy e2e/.env.example to e2e/.env and mint a token." >&2
  exit 1
fi

# ── boot sim ─────────────────────────────────────────────────────────────
SIM_UDID="${IOS_SIM_UDID:-}"
if [[ -z "$SIM_UDID" ]]; then
  SIM_UDID="$(xcrun simctl list devices booted 2>/dev/null \
    | grep -oE '\([0-9A-F-]{36}\)' \
    | head -1 \
    | tr -d '()')"
fi
if [[ -z "$SIM_UDID" ]]; then
  echo "→ no booted sim; booting iPhone 17 Pro"
  SIM_UDID="67798693-4ADE-4D41-A505-8DAA1654F0E4"
  xcrun simctl boot "$SIM_UDID" 2>/dev/null || true
  open -a Simulator
  sleep 5
fi
echo "→ using sim $SIM_UDID"

# ── build + install ──────────────────────────────────────────────────────
bash "$REPO_ROOT/e2e/scripts/build-and-install-ios.sh"

# ── run maestro flows sequentially ───────────────────────────────────────
mkdir -p e2e/artifacts
cd e2e/maestro

PASS=0
FAIL=0
FAILED_FLOWS=()

for flow in 01-shell-smoke.yml 02-signin-pat.yml 03-note-crud.yml 04-sync.yml; do
  echo
  echo "──────────────────────────────────────────────"
  echo "  Running $flow"
  echo "──────────────────────────────────────────────"
  if maestro --device "$SIM_UDID" test -e E2E_PAT="$E2E_PAT" "$flow"; then
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
