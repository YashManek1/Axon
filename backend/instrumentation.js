// Loaded before server.js via --import so OTEL patches modules before they are required.
// When OTEL_EXPORTER_OTLP_ENDPOINT is unset the entire SDK is skipped — every API call
// in the rest of the codebase becomes a no-op via the OTEL global noop implementations.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    // OTLPTraceExporter reads OTEL_EXPORTER_OTLP_ENDPOINT + OTEL_EXPORTER_OTLP_HEADERS automatically.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Suppress high-cardinality / low-signal auto-instrumentations.
        "@opentelemetry/instrumentation-fs":  { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.on("SIGTERM", () => sdk.shutdown().finally(() => process.exit(0)));
}
