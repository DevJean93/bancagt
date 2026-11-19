'use strict';

const http = require('http');
const { crearApp } = require('./app');
const { crearMetricas } = require('./lib/metrics');
const { crearPool } = require('./lib/db');
const { crearRepositorio } = require('./repositorio');

const PORT = parseInt(process.env.PORT || '8080', 10);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const config = {
  version: process.env.APP_VERSION || '1.0.0',
  entorno: process.env.APP_ENV || 'local',
  faultRate: Math.min(Math.max(parseFloat(process.env.FAULT_RATE || '0'), 0), 1),
  faultLatencyMs: parseInt(process.env.FAULT_LATENCY_MS || '0', 10),
};

// Logs JSON en stdout: los recoge Grafana Alloy y los envía a Loki.
function log(nivel, mensaje) {
  if (LOG_LEVEL === 'error' && nivel !== 'error') return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), servicio: 'api-transferencias', nivel, mensaje }));
}

const pool = crearPool();
pool.on('error', (err) => log('error', `Error del pool de BD: ${err.message}`));

const app = crearApp({
  repo: crearRepositorio(pool),
  metricas: crearMetricas('api-transferencias'),
  config,
  log,
});

const server = http.createServer(app);
server.listen(PORT, () => {
  log('info', `api-transferencias escuchando en ${PORT} (version ${config.version}, FAULT_RATE=${config.faultRate})`);
});

// Cierre ordenado: Kubernetes envía SIGTERM antes de matar el pod.
process.on('SIGTERM', () => {
  log('info', 'SIGTERM recibido, cerrando');
  server.close(() => pool.end().finally(() => process.exit(0)));
});
