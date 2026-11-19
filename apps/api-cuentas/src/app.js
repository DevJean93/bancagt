'use strict';

// api-cuentas: consulta de saldo y movimientos (solo lectura).
// La app se construye con dependencias inyectadas para poder probarla sin BD.
const os = require('os');
const { responder } = require('./lib/http');

const RUTA_SALDO = /^\/api\/v1\/cuentas\/(\d{4})\/saldo$/;
const RUTA_MOVS = /^\/api\/v1\/cuentas\/(\d{4})\/movimientos$/;

function crearApp({ repo, metricas, config, log }) {
  const { version, entorno, faultRate, faultLatencyMs } = config;
  const enviar = (res, status, cuerpo) => responder(res, status, cuerpo, version);

  // Etiqueta de ruta con baja cardinalidad para Prometheus (sin IDs de cuenta).
  function rutaMetrica(pathname) {
    if (RUTA_SALDO.test(pathname)) return '/api/v1/cuentas/:id/saldo';
    if (RUTA_MOVS.test(pathname)) return '/api/v1/cuentas/:id/movimientos';
    if (['/health', '/ready', '/info', '/metrics'].includes(pathname)) return pathname;
    return 'otra';
  }

  async function atender(url, res) {
    if (url.pathname === '/info') {
      return enviar(res, 200, {
        servicio: 'api-cuentas',
        version,
        entorno,
        pod: os.hostname(),
        uid: process.getuid ? process.getuid() : null,
      });
    }

    let m = url.pathname.match(RUTA_SALDO);
    if (m) {
      const cuenta = await repo.obtenerCuenta(m[1]);
      if (!cuenta) return enviar(res, 404, { error: 'Cuenta no encontrada' });
      log('info', `Consulta de saldo cuenta ${m[1]}`);
      return enviar(res, 200, { cuenta: cuenta.id, titular: cuenta.titular, moneda: cuenta.moneda, saldo: cuenta.saldo });
    }

    m = url.pathname.match(RUTA_MOVS);
    if (m) {
      const cuenta = await repo.obtenerCuenta(m[1]);
      if (!cuenta) return enviar(res, 404, { error: 'Cuenta no encontrada' });
      const limite = Math.min(Math.max(parseInt(url.searchParams.get('limite') || '10', 10) || 10, 1), 50);
      const movimientos = await repo.listarMovimientos(m[1], limite);
      return enviar(res, 200, { cuenta: cuenta.id, movimientos });
    }

    return enviar(res, 404, { error: 'Ruta no encontrada' });
  }

  return async function manejador(req, res) {
    const url = new URL(req.url, 'http://localhost');
    metricas.medir(req, res, rutaMetrica(url.pathname));

    try {
      if (req.method !== 'GET') return enviar(res, 405, { error: 'Método no permitido' });

      if (url.pathname === '/health') return enviar(res, 200, { estado: 'ok' });
      if (url.pathname === '/ready') {
        await repo.ping();
        return enviar(res, 200, { estado: 'ok' });
      }
      if (url.pathname === '/metrics') {
        res.writeHead(200, { 'Content-Type': metricas.registry.contentType });
        return res.end(await metricas.registry.metrics());
      }

      // Inyección de fallas para la demo del canary. Las sondas no se ven
      // afectadas: la falla es "silenciosa" y debe detectarla el análisis.
      if (faultRate > 0 && Math.random() < faultRate) {
        log('error', `Falla inyectada en ${url.pathname}`);
        return enviar(res, 500, { error: 'Error interno simulado', version });
      }
      if (faultLatencyMs > 0) await new Promise((r) => setTimeout(r, faultLatencyMs));

      return await atender(url, res);
    } catch (err) {
      log('error', `Error atendiendo ${url.pathname}: ${err.message}`);
      // No se filtra el detalle del error al cliente.
      return enviar(res, url.pathname === '/ready' ? 503 : 500, { error: 'Error interno' });
    }
  };
}

module.exports = { crearApp };
