// DTOs de salida: el contrato HTTP es independiente del modelo de dominio.
// Los montos viajan como texto decimal exacto ("1250.50") para no perder precisión.
import type { Cuenta, Movimiento } from '../dominio/modelos.js';
import { enmascararNumero } from '../dominio/modelos.js';
import type { EstadoCuenta, PuntoFlujo } from '../aplicacion/casos-uso.js';

export const aCuentaDto = (c: Cuenta) => ({
  id: c.id,
  numero: c.numero,
  numeroEnmascarado: enmascararNumero(c.numero),
  tipo: c.tipo,
  moneda: c.moneda,
  alias: c.alias,
  estado: c.estado,
  saldoContable: c.saldoContable.aTexto(),
  saldoDisponible: c.saldoDisponible.aTexto(),
  enReserva: c.saldoContable.restar(c.saldoDisponible).aTexto(),
  abiertaEn: c.abiertaEn.toISOString(),
});

export const aMovimientoDto = (m: Movimiento) => ({
  id: m.id,
  fecha: m.fecha.toISOString(),
  tipo: m.tipo,
  categoria: m.categoria,
  descripcion: m.descripcion,
  monto: m.monto.aTexto(),
  saldoPosterior: m.saldoPosterior.aTexto(),
  referencia: m.referencia,
});

export const aEstadoCuentaDto = (e: EstadoCuenta) => ({
  cuenta: aCuentaDto(e.cuenta),
  periodo: {
    anio: e.periodo.anio,
    mes: e.periodo.mes,
    desde: e.periodo.desde.toISOString(),
    hasta: new Date(e.periodo.hasta.getTime() - 1).toISOString(),
  },
  saldoInicial: e.saldoInicial.aTexto(),
  totalCreditos: e.totalCreditos.aTexto(),
  totalDebitos: e.totalDebitos.aTexto(),
  saldoFinal: e.saldoFinal.aTexto(),
  porCategoria: e.porCategoria.map((p) => ({ categoria: p.categoria, total: p.total.aTexto() })),
  movimientos: e.movimientos.map(aMovimientoDto),
  generadoEn: new Date().toISOString(),
});

export const aPuntoFlujoDto = (p: PuntoFlujo) => ({
  fecha: p.fecha,
  ingresos: p.ingresos.aTexto(),
  egresos: p.egresos.aTexto(),
  saldo: p.saldo.aTexto(),
});
