import type { Dinero, Moneda } from '@bancagt/plataforma';

export interface CuentaOperable {
  id: string;
  numero: string;
  clienteId: string;
  tipo: 'MONETARIA' | 'AHORRO';
  moneda: Moneda;
  estado: 'ACTIVA' | 'BLOQUEADA' | 'CERRADA';
  saldoDisponible: Dinero;
  titular: string;
}

export interface Beneficiario {
  id: string;
  alias: string;
  cuenta: CuentaOperable;
  creadoEn: Date;
}

export type Destino = { tipo: 'PROPIA'; cuentaId: string } | { tipo: 'BENEFICIARIO'; beneficiarioId: string };

export interface Transferencia {
  id: string;
  referencia: string;
  clienteId: string;
  idempotencyKey: string;
  origen: CuentaOperable;
  destino: CuentaOperable;
  aliasDestino: string | null;
  monto: Dinero;
  concepto: string;
  estado: 'COMPLETADA' | 'RECHAZADA';
  creadaEn: Date;
}

/** Referencia legible del comprobante: TRF-00001234. */
export const referenciaDe = (numero: bigint | number) => `TRF-${numero.toString().padStart(8, '0')}`;

export const enmascararNumero = (numero: string) => `•••• ${numero.slice(-4)}`;

/** "María Fernanda López" → "María L." : se muestra al ordenante sin exponer el nombre completo. */
export function enmascararTitular(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/);
  const nombre = partes[0] ?? '';
  const inicialApellido = partes.length > 2 ? partes[partes.length - 2]?.[0] : partes[1]?.[0];
  return inicialApellido ? `${nombre} ${inicialApellido}.` : nombre;
}

/** Inicio del día actual en hora de Guatemala (UTC-6, sin horario de verano). */
export function inicioDelDiaGuatemala(ahora: Date): Date {
  const local = new Date(ahora.getTime() - 6 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 6));
}
