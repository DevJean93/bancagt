'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { crearApp, validar } = require('../src/app');
const { crearMetricas } = require('../src/lib/metrics');
const { ErrorNegocio } = require('../src/repositorio');

// Repositorio en memoria que imita las reglas del repositorio real.
function repoEnMemoria() {
  const cuentas = { 1001: { moneda: 'GTQ', saldo: 1000 }, 1002: { moneda: 'GTQ', saldo: 0 }, 2001: { moneda: 'USD', saldo: 50 } };
  const porClave = new Map();
  let n = 0;
  return {
    cuentas,
    ping: async () => {},
    obtener: async (id) => [...porClave.values()].find((t) => t.id === id) || null,
    transferir: async ({ clave, origen, destino, monto }) => {
      if (porClave.has(clave)) return { repetida: true, transferencia: porClave.get(clave) };
      const o = cuentas[origen];
      const d = cuentas[destino];
      if (!o || !d) throw new ErrorNegocio(404, 'Cuenta de origen o destino no existe');
      if (o.moneda !== d.moneda) throw new ErrorNegocio(422, 'Las cuentas tienen monedas distintas');
      if (o.saldo < monto) throw new ErrorNegocio(422, 'Saldo insuficiente');
      o.saldo -= monto;
      d.saldo += monto;
      n += 1;
      const t = { id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, origen, destino, monto, moneda: o.moneda, estado: 'COMPLETADA' };
      porClave.set(clave, t);
      return { repetida: false, transferencia: t };
    },
  };
}

let server;
let base;
let repo;
before(async () => {
  repo = repoEnMemoria();
  const app = crearApp({
    repo,
    metricas: crearMetricas('api-transferencias-test'),
    config: { version: 'test', entorno: 'test', faultRate: 0, faultLatencyMs: 0 },
    log: () => {},
  });
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (cuerpo, clave = 'clave-prueba-0001', tipo = 'application/json') =>
  fetch(`${base}/api/v1/transferencias`, {
    method: 'POST',
    headers: { 'Content-Type': tipo, ...(clave ? { 'Idempotency-Key': clave } : {}) },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });

test('validar rechaza montos inválidos', () => {
  assert.ok(validar({ origen: '1001', destino: '1002', monto: -5 }));
  assert.ok(validar({ origen: '1001', destino: '1002', monto: 10.123 }));
  assert.ok(validar({ origen: '1001', destino: '1002', monto: '100' }));
  assert.ok(validar({ origen: '1001', destino: '1002', monto: 50000.01 }));
  assert.ok(validar({ origen: '1001', destino: '1001', monto: 1 }));
  assert.equal(validar({ origen: '1001', destino: '1002', monto: 10.5 }), null);
});

test('transferencia válida responde 201 y mueve el saldo', async () => {
  const r = await post({ origen: '1001', destino: '1002', monto: 250.5 }, 'clave-ok-000001');
  assert.equal(r.status, 201);
  assert.equal(repo.cuentas[1001].saldo, 749.5);
  assert.equal(repo.cuentas[1002].saldo, 250.5);
});

test('repetir la misma Idempotency-Key no duplica el cargo', async () => {
  const r = await post({ origen: '1001', destino: '1002', monto: 250.5 }, 'clave-ok-000001');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).repetida, true);
  assert.equal(repo.cuentas[1001].saldo, 749.5);
});

test('misma clave con otros datos responde 409', async () => {
  const r = await post({ origen: '1001', destino: '1002', monto: 1 }, 'clave-ok-000001');
  assert.equal(r.status, 409);
});

test('sin Idempotency-Key responde 400', async () => {
  const r = await post({ origen: '1001', destino: '1002', monto: 1 }, null);
  assert.equal(r.status, 400);
});

test('saldo insuficiente responde 422', async () => {
  const r = await post({ origen: '1002', destino: '1001', monto: 999999 / 100 }, 'clave-sin-saldo-01');
  assert.equal(r.status, 422);
});

test('monedas distintas responde 422', async () => {
  const r = await post({ origen: '2001', destino: '1001', monto: 1 }, 'clave-moneda-0001');
  assert.equal(r.status, 422);
});

test('cuerpo que no es JSON responde 415', async () => {
  const r = await post('origen=1001', 'clave-tipo-00001', 'text/plain');
  assert.equal(r.status, 415);
});

test('JSON mal formado responde 400', async () => {
  const r = await post('{"origen":', 'clave-json-00001');
  assert.equal(r.status, 400);
});

test('consultar una transferencia por id', async () => {
  const r = await fetch(`${base}/api/v1/transferencias/00000000-0000-0000-0000-000000000001`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).estado, 'COMPLETADA');
});

test('GET sobre la colección responde 405', async () => {
  const r = await fetch(`${base}/api/v1/transferencias`);
  assert.equal(r.status, 405);
});
