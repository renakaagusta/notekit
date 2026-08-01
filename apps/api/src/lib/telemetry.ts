import Pyroscope from "@pyroscope/nodejs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

// NodeSDK auto-configures exporters from:
//   OTEL_EXPORTER_OTLP_ENDPOINT  → collector URL
//   OTEL_TRACES_EXPORTER=otlp    → traces → Tempo
//   OTEL_METRICS_EXPORTER=otlp   → metrics → Mimir
//   OTEL_LOGS_EXPORTER=otlp      → logs → Loki

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "notekit-api",
    [ATTR_SERVICE_VERSION]: "0.1.0",
    "deployment.environment": process.env.NODE_ENV ?? "development",
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // fs is too noisy for SQLite workloads
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();

// Pyroscope continuous profiling — labels include service name so profiles
// can be correlated with traces in Grafana via the profile_id tag.
Pyroscope.init({
  serverAddress: process.env.PYROSCOPE_ENDPOINT ?? "http://localhost:4040",
  appName: "notekit-api",
  tags: {
    env: process.env.NODE_ENV ?? "development",
    version: "0.1.0",
  },
});
Pyroscope.start();

process.once("SIGTERM", () => {
  Pyroscope.stop();
  sdk.shutdown().catch(() => {});
});
process.once("SIGINT", () => {
  Pyroscope.stop();
  sdk.shutdown().catch(() => {});
});
