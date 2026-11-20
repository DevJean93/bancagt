import type { Dinero, Moneda } from '@bancagt/plataforma';

export type TipoCuenta = 'MONETARIA' | 'AHORRO';
export type EstadoCuenta = 'ACTIVA' | 'BLOQUEADA' | 'CERRADA';
export type TipoMovimiento = 'CREDITO' | 'DEBITO';
export type Categoria =
  | 'SALARIO' | 'TRANSFERENCIA' | 'SERVICIOS' | 'SUPERMERCADO' | 'RESTAURANTE' | 'COMBUSTIBLE'
  | 'CAJERO' | 'SALUD' | 'EDUCACION' | 'ENTRETENIMIENTO' | 'COMPRAS' | 'INTERESES' | 'COMISIONES' | 'OTROS';

export interface Cuenta {
  id: string;
  numero: string;
  clienteId: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  alias: string | null;
  estado: EstadoCuenta;
  saldoContable: Dinero;
  saldoDisponible: Dinero;
  abiertaEn: Date;
}

export interface Movimiento {
  id: string;
  fecha: Date;
  tipo: TipoMovimiento;
  categoria: Categoria;
  descripcion: string;
  monto: Dinero;
  saldoPosterior: Dinero;
  referencia: string | null;
}

export interface FiltroMovimientos {
  desde?: Date;
  hasta?: Date;
  tipo?: TipoMovimiento;
  categoria?: Categoria;
  texto?: string;
}

export interface Pagina<T> {
  elementos: T[];
  total: number;
  pagina: number;
  tamano: number;
}

/** Número de cuenta enmascarado para mostrar (•••• 4521). */
export function enmascararNumero(numero: string): string {
  return `•••• ${numero.slice(-4)}`;
}
