import Pyroscope from "@pyroscope/nodejs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
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
      "@opentelemetry/instrumentation-fs": { enabled: false },
      // http server instrumentation doesn't work with ESM (tsx) — manual spans
      // are created in the Hono middleware in index.ts instead.
      "@opentelemetry/instrumentation-http": { enabled: false },
      // Override pg — we provide a custom requestHook below for query visibility.
      "@opentelemetry/instrumentation-pg": { enabled: false },
    }),
    // Explicit pg instrumentation with full query+parameter visibility.
    new PgInstrumentation({
      // Attach raw parameter values as db.query.parameters attribute.
      enhancedDatabaseReporting: true,
      // requestHook: inline $1/$2/... placeholders with actual values so
      // db.statement in Tempo shows the real query without a separate lookup.
      requestHook(span, { query }) {
        const { text, values } = query;
        if (!values || values.length === 0) return;
        const inlined = values.reduce<string>((sql, val, i) => {
          const re = new RegExp(`\\$${i + 1}(?!\\d)`, "g");
          const lit =
            val == null
              ? "NULL"
              : typeof val === "string"
              ? `'${val.replace(/'/g, "''")}'`
              : String(val);
          return sql.replace(re, lit);
        }, text);
        span.setAttribute("db.statement", inlined);
      },
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
