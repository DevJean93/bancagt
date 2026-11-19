// Prueba de continuidad (zero-downtime) durante un despliegue.
// Se ejecuta desde la laptop mientras Argo Rollouts promueve una versión nueva:
//   k6 run -e MINUTOS=6 tests/k6/continuidad.js
// Criterio: 0 % de errores y p95 < 300 ms mientras dura el rollout.
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE || 'https://banca.127.0.0.1.nip.io';
const MINUTOS = __ENV.MINUTOS || '6';

export const options = {
  insecureSkipTLSVerify: true,
  scenarios: {
    continuidad: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: `${MINUTOS}m`,
      preAllocatedVUs: 20,
      maxVUs: 60,
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<300'],
    checks: ['rate==1'],
  },
};

export default function () {
  const r = http.get(`${BASE}/api/v1/cuentas/1001/saldo`, { tags: { flujo: 'saldo' } });
  check(r, {
    'status 200': (x) => x.status === 200,
    'HSTS presente': (x) => (x.headers['Strict-Transport-Security'] || '').includes('max-age'),
  });
}

export function handleSummary(data) {
  const m = data.metrics;
  const resumen = [
    `Peticiones: ${m.http_reqs.values.count}`,
    `Fallidas: ${(m.http_req_failed.values.rate * 100).toFixed(3)} %`,
    `p95: ${m.http_req_duration.values['p(95)'].toFixed(1)} ms`,
    `Umbrales: ${Object.entries(data.metrics).filter(([, v]) => v.thresholds).map(([k, v]) => `${k}=${Object.values(v.thresholds).every((t) => t.ok) ? 'OK' : 'FALLA'}`).join(', ')}`,
  ].join('\n');
  return { stdout: `\n${resumen}\n`, 'evidencias/k6-continuidad.json': JSON.stringify(data, null, 2) };
}
