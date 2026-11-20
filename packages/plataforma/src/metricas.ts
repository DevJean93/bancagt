import client from 'prom-client';
import type { FastifyInstance } from 'fastify';

// Métricas RED (Rate, Errors, Duration) que alimentan los SLI.
// La etiqueta "route" usa la PLANTILLA de la ruta (/cuentas/:id), nunca el
// valor real, para mantener baja cardinalidad y no exponer números de cuenta.

export interface Metricas {
  registry: client.Registry;
  operacionesNegocio: client.Counter<'operacion' | 'resultado'>;
}

export function crearMetricas(servicio: string): Metricas {
  const registry = new client.Registry();
  registry.setDefaultLabels({ servicio });
  client.collectDefaultMetrics({ register: registry });

  const operacionesNegocio = new client.Counter({
    name: 'banca_operaciones_total',
    help: 'Operaciones de negocio por tipo y resultado',
    labelNames: ['operacion', 'resultado'] as const,
    registers: [registry],
  });

  return { registry, operacionesNegocio };
}

export function registrarMetricasHttp(app: FastifyInstance, metricas: Metricas): void {
  const peticiones = new client.Counter({
    name: 'http_requests_total',
    help: 'Total de peticiones HTTP atendidas',
    labelNames: ['method', 'route', 'code'] as const,
    registers: [metricas.registry],
  });
  const duracion = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duración de las peticiones HTTP en segundos',
    labelNames: ['method', 'route', 'code'] as const,
    buckets: [0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2.5],
    registers: [metricas.registry],
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? 'no-encontrada';
    if (route === '/metrics') return;
    const etiquetas = { method: req.method, route, code: String(reply.statusCode) };
    peticiones.inc(etiquetas);
    duracion.observe(etiquetas, reply.elapsedTime / 1000);
  });

  app.get('/metrics', { logLevel: 'warn' }, async (_req, reply) => {
    reply.header('Content-Type', metricas.registry.contentType);
    return metricas.registry.metrics();
  });
}
