'use strict';

// api-transferencias: transferencias entre cuentas propias del banco.
const os = require('os');
const { responder, leerJson } = require('./lib/http');

const RUTA_DETALLE = /^\/api\/v1\/transferencias\/([0-9a-f-]{36})$/;
const CUENTA = /^\d{4}$/;
const CLAVE = /^[A-Za-z0-9-]{8,64}$/;
const MONTO_MAXIMO = 50000; // límite por operación (control de fraude)

// Valida el cuerpo. Devuelve un mensaje de error o null.
function validar(body) {
  const { origen, destino, monto } = body || {};
  if (!CUENTA.test(String(origen)) || !CUENTA.test(String(destino))) return 'origen y destino deben ser cuentas de 4 dígitos';
  if (origen === destino) return 'origen y destino no pueden ser la misma cuenta';
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) return 'monto debe ser un número positivo';
  if (Math.round(monto * 100) !== monto * 100) return 'monto admite como máximo 2 decimales';
  if (monto > MONTO_MAXIMO) return `monto supera el límite por operación (${MONTO_MAXIMO})`;
  return null;
}

function crearApp({ repo, metricas, config, log }) {
  const { version, entorno, faultRate, faultLatencyMs } = config;
  const enviar = (res, status, cuerpo) => responder(res, status, cuerpo, version);

  function rutaMetrica(pathname) {
    if (pathname === '/api/v1/transferencias') return pathname;
    if (RUTA_DETALLE.test(pathname)) return '/api/v1/transferencias/:id';
    if (['/health', '/ready', '/info', '/metrics'].includes(pathname)) return pathname;
    return 'otra';
  }

  async function crearTransferencia(req, res) {
    const clave = req.headers['idempotency-key'];
    if (!clave || !CLAVE.test(clave)) {
      return enviar(res, 400, { error: 'Encabezado Idempotency-Key requerido (8-64 caracteres alfanuméricos o guion)' });
    }
    const body = await leerJson(req);
    const error = validar(body);
    if (error) return enviar(res, 400, { error });

    const { origen, destino, monto } = body;
    const r = await repo.transferir({ clave, origen, destino, monto });
    const t = r.transferencia;

    if (r.repetida) {
      // Misma clave con datos distintos = uso indebido de la clave.
      if (t.origen !== origen || t.destino !== destino || t.monto !== monto) {
        return enviar(res, 409, { error: 'Idempotency-Key ya usada con otros datos' });
      }
      return enviar(res, 200, { ...t, repetida: true });
    }
    log('info', `Transferencia ${t.id} ${origen}->${destino} por ${monto} ${t.moneda}`);
    return enviar(res, 201, t);
  }

  async function atender(req, url, res) {
    if (req.method === 'GET' && url.pathname === '/info') {
      return enviar(res, 200, { servicio: 'api-transferencias', version, entorno, pod: os.hostname() });
    }
    if (url.pathname === '/api/v1/transferencias') {
      if (req.method !== 'POST') return enviar(res, 405, { error: 'Método no permitido' });
      return crearTransferencia(req, res);
    }
    const m = url.pathname.match(RUTA_DETALLE);
    if (m) {
      if (req.method !== 'GET') return enviar(res, 405, { error: 'Método no permitido' });
      const t = await repo.obtener(m[1]);
      return t ? enviar(res, 200, t) : enviar(res, 404, { error: 'Transferencia no encontrada' });
    }
    return enviar(res, 404, { error: 'Ruta no encontrada' });
  }

  return async function manejador(req, res) {
    const url = new URL(req.url, 'http://localhost');
    metricas.medir(req, res, rutaMetrica(url.pathname));

    try {
      if (url.pathname === '/health') return enviar(res, 200, { estado: 'ok' });
      if (url.pathname === '/ready') {
        await repo.ping();
        return enviar(res, 200, { estado: 'ok' });
      }
      if (url.pathname === '/metrics') {
        res.writeHead(200, { 'Content-Type': metricas.registry.contentType });
        return res.end(await metricas.registry.metrics());
      }

      if (faultRate > 0 && Math.random() < faultRate) {
        log('error', `Falla inyectada en ${url.pathname}`);
        return enviar(res, 500, { error: 'Error interno simulado', version });
      }
      if (faultLatencyMs > 0) await new Promise((r) => setTimeout(r, faultLatencyMs));

      return await atender(req, url, res);
    } catch (err) {
      if (err.status && err.status < 500) return enviar(res, err.status, { error: err.message });
      log('error', `Error atendiendo ${url.pathname}: ${err.message}`);
      return enviar(res, url.pathname === '/ready' ? 503 : 500, { error: 'Error interno' });
    }
  };
}

module.exports = { crearApp, validar };
