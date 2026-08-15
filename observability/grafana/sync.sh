#!/bin/bash
# Push Grafana dashboards (as-code) to the Grafana HTTP API. Idempotent (overwrite
# by uid). The JSON files in this dir are the source of truth — Grafana is not.
# Runs on deploy after the app is healthy (see scripts/deploy.sh).
#
#   env: GRAFANA_URL    (default http://localhost:3000 — Grafana is host-published)
#        GRAFANA_TOKEN  (service-account token; if unset the sync is skipped)
#        GRAFANA_FOLDER (default "Acquity")
#
# Portable: any repo can copy this file next to its dashboard JSON and set
# GRAFANA_FOLDER to its own name.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
URL="${GRAFANA_URL:-http://localhost:3000}"
FOLDER="${GRAFANA_FOLDER:-Acquity}"

if [ -z "${GRAFANA_TOKEN:-}" ]; then echo "[grafana-sync] GRAFANA_TOKEN unset — skipping"; exit 0; fi

hdr_auth="Authorization: Bearer ${GRAFANA_TOKEN}"
hdr_json="Content-Type: application/json"

# Ensure the folder exists → resolve its uid (folders are matched by title).
fuid=$(curl -sf -H "$hdr_auth" "$URL/api/folders?limit=1000" | jq -r --arg t "$FOLDER" '.[] | select(.title==$t) | .uid' | head -1)
if [ -z "$fuid" ]; then
  fuid=$(curl -sf -H "$hdr_auth" -H "$hdr_json" -X POST "$URL/api/folders" -d "$(jq -n --arg t "$FOLDER" '{title:$t}')" | jq -r '.uid')
  echo "[grafana-sync] created folder '$FOLDER' ($fuid)"
fi

rc=0
shopt -s nullglob
for f in "$DIR"/*.json; do
  payload=$(jq --arg fuid "$fuid" '{dashboard: (. + {id:null}), folderUid:$fuid, overwrite:true}' "$f")
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "$hdr_auth" -H "$hdr_json" -X POST "$URL/api/dashboards/db" -d "$payload")
  if [ "$code" = "200" ]; then echo "[grafana-sync] pushed $(basename "$f")"; else echo "[grafana-sync] FAILED $(basename "$f") (HTTP $code)"; rc=1; fi
done
exit $rc
