'use strict';

// Trazas distribuidas con OpenTelemetry. Se carga antes que la app con
// `node --require ./src/lib/tracing.js`. Si no hay colector configurado,
// no hace nada (útil en pruebas locales).
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
  const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      new HttpInstrumentation({
        // No se trazan sondas ni scraping: solo generan ruido.
        ignoreIncomingRequestHook: (req) => ['/health', '/ready', '/metrics'].includes(req.url),
      }),
      new PgInstrumentation(),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown().catch(() => {}));
}
