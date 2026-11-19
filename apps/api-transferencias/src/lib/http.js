'use strict';

// Utilidades HTTP sin framework: menos dependencias = menos superficie de ataque.

const MAX_BODY_BYTES = 10 * 1024;

function responder(res, status, cuerpo, version) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'X-App-Version': version,
  });
  res.end(JSON.stringify(cuerpo));
}

// Lee un cuerpo JSON con límite de tamaño. Rechaza contenido que no sea JSON.
function leerJson(req) {
  return new Promise((resolve, reject) => {
    const tipo = req.headers['content-type'] || '';
    if (!tipo.startsWith('application/json')) {
      return reject(Object.assign(new Error('Content-Type debe ser application/json'), { status: 415 }));
    }
    let total = 0;
    const partes = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('JSON inválido'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { responder, leerJson };
