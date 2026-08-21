import { trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import pino from "pino";

const otelLogger = logs.getLogger("notekit-api");

const severityMap: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

// Inject active OTel trace context into every log line so Loki can link to Tempo.
function traceContext(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span?.isRecording()) return {};
  const { traceId, spanId } = span.spanContext();
  return { trace_id: traceId, span_id: spanId };
}

// Bridge: emit every Pino log record to the OTel log SDK so it reaches Loki.
const otelBridge = {
  write(msg: string) {
    try {
      const record = JSON.parse(msg);
      const level: string = record.level ?? "info";
      otelLogger.emit({
        severityNumber: severityMap[level] ?? SeverityNumber.INFO,
        severityText: level.toUpperCase(),
        body: record.msg ?? "",
        attributes: Object.fromEntries(
          Object.entries(record).filter(
            ([k]) => !["level", "time", "pid", "hostname", "msg"].includes(k)
          )
        ) as Record<string, string | number | boolean>,
        timestamp: record.time ? new Date(record.time) : new Date(),
      });
    } catch {
      // ignore malformed records
    }
  },
};

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    // Inject trace_id + span_id into every log record automatically.
    mixin: traceContext,
    formatters: {
      level: (label) => ({ level: label }),
    },
  },
  pino.multistream([
    { stream: process.stdout, level: "info" as pino.Level },
    { stream: otelBridge, level: "info" as pino.Level },
  ])
);
