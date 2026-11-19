'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { crearApp } = require('../src/app');
const { crearMetricas } = require('../src/lib/metrics');

// Repositorio en memoria: las pruebas no necesitan PostgreSQL.
const datos = {
  1001: { id: '1001', titular: 'Cliente Demo A', moneda: 'GTQ', saldo: 15250.75 },
};
const repoFalso = {
  ping: async () => {},
  obtenerCuenta: async (id) => datos[id] || null,
  listarMovimientos: async () => [{ id: 1, tipo: 'CREDITO', monto: 100, referencia: 'apertura' }],
};

function levantar(config) {
  const app = crearApp({
    repo: repoFalso,
    metricas: crearMetricas('api-cuentas-test'),
    config: { version: 'test', entorno: 'test', faultRate: 0, faultLatencyMs: 0, ...config },
    log: () => {},
  });
  const server = http.createServer(app);
  return new Promise((r) => server.listen(0, () => r(server)));
}

let server;
let base;
before(async () => {
  server = await levantar({});
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('GET /health responde 200', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
});

test('GET saldo de cuenta existente devuelve el saldo', async () => {
  const r = await fetch(`${base}/api/v1/cuentas/1001/saldo`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.saldo, 15250.75);
  assert.equal(body.moneda, 'GTQ');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('GET saldo de cuenta inexistente devuelve 404', async () => {
  const r = await fetch(`${base}/api/v1/cuentas/9999/saldo`);
  assert.equal(r.status, 404);
});

test('id de cuenta con formato inválido no llega al repositorio', async () => {
  const r = await fetch(`${base}/api/v1/cuentas/1%27%20OR%201=1/saldo`);
  assert.equal(r.status, 404);
});

test('GET movimientos devuelve la lista', async () => {
  const r = await fetch(`${base}/api/v1/cuentas/1001/movimientos?limite=5`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).movimientos.length, 1);
});

test('métodos distintos de GET se rechazan con 405', async () => {
  const r = await fetch(`${base}/api/v1/cuentas/1001/saldo`, { method: 'DELETE' });
  assert.equal(r.status, 405);
});

test('/metrics expone http_requests_total sin IDs de cuenta', async () => {
  const r = await fetch(`${base}/metrics`);
  const texto = await r.text();
  assert.match(texto, /http_requests_total/);
  assert.match(texto, /route="\/api\/v1\/cuentas\/:id\/saldo"/);
  assert.doesNotMatch(texto, /cuentas\/1001/);
});

test('FAULT_RATE=1 provoca 500 en negocio pero no en las sondas', async () => {
  const s = await levantar({ faultRate: 1 });
  const b = `http://127.0.0.1:${s.address().port}`;
  try {
    assert.equal((await fetch(`${b}/api/v1/cuentas/1001/saldo`)).status, 500);
    assert.equal((await fetch(`${b}/health`)).status, 200);
    assert.equal((await fetch(`${b}/ready`)).status, 200);
  } finally {
    s.close();
  }
});
