'use strict';

// Métricas RED (Rate, Errors, Duration) para los SLI del proyecto.
// - SLI de disponibilidad: proporción de respuestas que NO son 5xx.
// - SLI de latencia: proporción de respuestas bajo 300 ms (histograma).
const client = require('prom-client');

function crearMetricas(servicio) {
  const registry = new client.Registry();
  registry.setDefaultLabels({ servicio });
  client.collectDefaultMetrics({ register: registry });

  const peticiones = new client.Counter({
    name: 'http_requests_total',
    help: 'Total de peticiones HTTP atendidas',
    labelNames: ['method', 'route', 'code'],
    registers: [registry],
  });

  const duracion = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duración de las peticiones HTTP en segundos',
    labelNames: ['method', 'route', 'code'],
    buckets: [0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2.5],
    registers: [registry],
  });

  // Envuelve la respuesta para medir cada petición al terminar.
  function medir(req, res, route) {
    const fin = duracion.startTimer();
    res.on('finish', () => {
      const etiquetas = { method: req.method, route, code: String(res.statusCode) };
      peticiones.inc(etiquetas);
      fin(etiquetas);
    });
  }

  return { registry, medir, peticiones, duracion };
}

module.exports = { crearMetricas };
