import type { Categoria, Moneda, TipoCuenta } from '../api/tipos';

const formatos = new Map<Moneda, Intl.NumberFormat>();

/** Q 15,250.75 / US$ 3,200.00 — separadores de miles y 2 decimales siempre. */
export function formatoMoneda(monto: string | number, moneda: Moneda, conSigno = false): string {
  let f = formatos.get(moneda);
  if (!f) {
    f = new Intl.NumberFormat('es-GT', { style: 'currency', currency: moneda, minimumFractionDigits: 2, currencyDisplay: 'symbol' });
    formatos.set(moneda, f);
  }
  const n = typeof monto === 'string' ? Number(monto) : monto;
  const texto = f.format(Math.abs(n));
  if (n < 0) return `−${texto}`;
  return conSigno ? `+${texto}` : texto;
}

const fechaCorta = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Guatemala' });
const fechaHora = new Intl.DateTimeFormat('es-GT', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala',
});
const mesAnio = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export const formatoFecha = (iso: string) => fechaCorta.format(new Date(iso));
export const formatoFechaHora = (iso: string) => fechaHora.format(new Date(iso));
export const formatoPeriodo = (anio: number, mes: number) => {
  const t = mesAnio.format(new Date(Date.UTC(anio, mes - 1, 1)));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Periodo AAAA-MM de hoy (hora de Guatemala) y de los meses anteriores. */
export function periodosRecientes(cantidad: number): string[] {
  const hoy = new Date(Date.now() - 6 * 3_600_000);
  return Array.from({ length: cantidad }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export const NOMBRE_TIPO_CUENTA: Record<TipoCuenta, string> = { MONETARIA: 'Monetaria', AHORRO: 'Ahorro' };

export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  SALARIO: 'Salario',
  TRANSFERENCIA: 'Transferencia',
  SERVICIOS: 'Servicios',
  SUPERMERCADO: 'Supermercado',
  RESTAURANTE: 'Restaurantes',
  COMBUSTIBLE: 'Combustible',
  CAJERO: 'Cajero',
  SALUD: 'Salud',
  EDUCACION: 'Educación',
  ENTRETENIMIENTO: 'Entretenimiento',
  COMPRAS: 'Compras',
  INTERESES: 'Intereses',
  COMISIONES: 'Comisiones',
  OTROS: 'Otros',
};

/** Formatea el número de cuenta en grupos: 3012345678 → 30-1234567-8 */
export const formatoNumeroCuenta = (n: string) => `${n.slice(0, 2)}-${n.slice(2, 9)}-${n.slice(9)}`;
