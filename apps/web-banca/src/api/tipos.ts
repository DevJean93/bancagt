// Contratos de la API (DTO). Los montos llegan como texto decimal exacto.
export type Moneda = 'GTQ' | 'USD';
export type TipoCuenta = 'MONETARIA' | 'AHORRO';
export type TipoMovimiento = 'CREDITO' | 'DEBITO';
export type Categoria =
  | 'SALARIO' | 'TRANSFERENCIA' | 'SERVICIOS' | 'SUPERMERCADO' | 'RESTAURANTE' | 'COMBUSTIBLE' | 'CAJERO'
  | 'SALUD' | 'EDUCACION' | 'ENTRETENIMIENTO' | 'COMPRAS' | 'INTERESES' | 'COMISIONES' | 'OTROS';

export interface Sesion {
  usuario?: string;
  nombre: string;
  ultimoAcceso?: string | null;
  expiraEn: string;
}

export interface Cuenta {
  id: string;
  numero: string;
  numeroEnmascarado: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  alias: string | null;
  estado: 'ACTIVA' | 'BLOQUEADA' | 'CERRADA';
  saldoContable: string;
  saldoDisponible: string;
  enReserva: string;
  abiertaEn: string;
}

export interface Posicion {
  cuentas: Cuenta[];
  totales: { moneda: Moneda; disponible: string; contable: string }[];
}

export interface Movimiento {
  id: string;
  fecha: string;
  tipo: TipoMovimiento;
  categoria: Categoria;
  descripcion: string;
  monto: string;
  saldoPosterior: string;
  referencia: string | null;
}

export interface Pagina<T> {
  elementos: T[];
  total: number;
  pagina: number;
  tamano: number;
  paginas: number;
}

export interface EstadoCuenta {
  cuenta: Cuenta;
  periodo: { anio: number; mes: number; desde: string; hasta: string };
  saldoInicial: string;
  totalCreditos: string;
  totalDebitos: string;
  saldoFinal: string;
  porCategoria: { categoria: Categoria; total: string }[];
  movimientos: Movimiento[];
  generadoEn: string;
}

export interface PuntoFlujo {
  fecha: string;
  ingresos: string;
  egresos: string;
  saldo: string;
}

export interface Beneficiario {
  id: string;
  alias: string;
  numeroEnmascarado: string;
  titular: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  creadoEn: string;
}

export interface ConsultaTitular {
  numeroEnmascarado: string;
  titular: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  esPropia: boolean;
}

export interface CuentaResumen {
  id: string;
  numeroEnmascarado: string;
  tipo: TipoCuenta;
  titular: string;
}

export interface Comprobante {
  id: string;
  referencia: string;
  fecha: string;
  estado: 'COMPLETADA' | 'RECHAZADA';
  monto: string;
  moneda: Moneda;
  concepto: string;
  origen: CuentaResumen;
  destino: CuentaResumen & { alias: string | null; propia: boolean };
  repetida?: boolean;
}

export interface Limite {
  moneda: Moneda;
  porOperacion: string;
  diarioTerceros: string;
  usadoHoy: string;
  disponibleHoy: string;
}

export type Destino = { tipo: 'PROPIA'; cuentaId: string } | { tipo: 'BENEFICIARIO'; beneficiarioId: string };

/** Error estándar RFC 9457 devuelto por las APIs. */
export interface Problema {
  type: string;
  title: string;
  status: number;
  codigo?: string;
  errores?: { campo: string; mensaje: string }[];
  [extra: string]: unknown;
}
