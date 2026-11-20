// Trazas distribuidas con OpenTelemetry. Se carga ANTES que la aplicación:
//   node --import @bancagt/plataforma/tracing dist/main.js
// Sin colector configurado (pruebas locales) no hace nada.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const sondas = new Set(['/health', '/ready', '/metrics']);
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => sondas.has(req.url ?? ''),
      }),
      new PgInstrumentation(),
    ],
  });
  sdk.start();
  process.once('SIGTERM', () => {
    sdk.shutdown().catch(() => undefined);
  });
}
