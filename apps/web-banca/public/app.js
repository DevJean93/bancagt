'use strict';

// Cliente del portal. Todo el texto que viene de la API se inserta con
// textContent (nunca innerHTML) para evitar XSS.
const $ = (sel) => document.querySelector(sel);
const fmt = (n, moneda) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: moneda }).format(n);

async function api(ruta, opciones) {
  const r = await fetch(ruta, opciones);
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo.error || `Error ${r.status}`);
  return cuerpo;
}

function celda(fila, texto, clase) {
  const td = document.createElement('td');
  td.textContent = texto;
  if (clase) td.className = clase;
  fila.appendChild(td);
}

async function consultar(cuenta) {
  const saldo = await api(`/api/v1/cuentas/${encodeURIComponent(cuenta)}/saldo`);
  $('#titular').textContent = `${saldo.titular} · ${saldo.cuenta}`;
  $('#monto').textContent = fmt(saldo.saldo, saldo.moneda);
  $('#saldo').hidden = false;

  const { movimientos } = await api(`/api/v1/cuentas/${encodeURIComponent(cuenta)}/movimientos?limite=10`);
  const tbody = $('#movimientos tbody');
  tbody.replaceChildren();
  for (const m of movimientos) {
    const tr = document.createElement('tr');
    celda(tr, new Date(m.creado_en).toLocaleString('es-GT'));
    celda(tr, m.tipo);
    celda(tr, m.referencia);
    celda(tr, fmt(m.tipo === 'DEBITO' ? -m.monto : m.monto, saldo.moneda), 'num');
    tbody.appendChild(tr);
  }
  $('#movimientos').hidden = movimientos.length === 0;
}

$('#form-consulta').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await consultar($('#cuenta').value);
  } catch (err) {
    $('#saldo').hidden = true;
    $('#movimientos').hidden = true;
    alert(err.message);
  }
});

$('#form-transferencia').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = new FormData(e.target);
  const salida = $('#resultado');
  try {
    const t = await api('/api/v1/transferencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        origen: datos.get('origen'),
        destino: datos.get('destino'),
        monto: Number(datos.get('monto')),
      }),
    });
    salida.className = 'resultado ok';
    salida.textContent = `Transferencia ${t.id.slice(0, 8)} completada por ${fmt(t.monto, t.moneda)}.`;
    if ($('#cuenta').value === datos.get('origen')) await consultar(datos.get('origen'));
  } catch (err) {
    salida.className = 'resultado error';
    salida.textContent = err.message;
  }
});

consultar($('#cuenta').value).catch(() => {});
fetch('/version.txt').then((r) => (r.ok ? r.text() : '')).then((v) => { $('#version').textContent = v.trim(); });
