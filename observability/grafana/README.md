# Grafana dashboard (as-code)

`notekit.json` → **NoteKit — API** dashboard on monitor.stackbase.id. Source of
truth lives here; Grafana is not.

Panels: RED golden signals (Tempo span-metrics, `service="notekit-api"`), traffic
& latency by operation, Node.js runtime (event-loop, V8 heap/GC, active handles),
database client (op latency, pool), outbound HTTP client, and logs (Loki).
Datasource UIDs: `mimir` / `loki` / `tempo`.

## Sync

```bash
GRAFANA_TOKEN=<service-account-token> GRAFANA_FOLDER=NoteKit ./sync.sh
```

Idempotent (overwrites by `uid`). `GRAFANA_URL` defaults to `http://localhost:3000`
(run on the monitoring host). To auto-sync on deploy, call this from the prod/api
deploy job with `GRAFANA_TOKEN` sourced from Vault (`secret/notekit`).
