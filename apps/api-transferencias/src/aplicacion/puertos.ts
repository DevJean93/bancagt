import type { Dinero, Moneda } from '@bancagt/plataforma';
import type { Beneficiario, CuentaOperable, Transferencia } from '../dominio/modelos.js';

export interface RepositorioCuentas {
  deCliente(cuentaId: string, clienteId: string): Promise<CuentaOperable | null>;
  porNumero(numero: string): Promise<CuentaOperable | null>;
}

export interface RepositorioBeneficiarios {
  listar(clienteId: string): Promise<Beneficiario[]>;
  obtener(id: string, clienteId: string): Promise<Beneficiario | null>;
  contar(clienteId: string): Promise<number>;
  existe(clienteId: string, cuentaId: string): Promise<boolean>;
  crear(clienteId: string, cuentaId: string, alias: string): Promise<Beneficiario>;
  eliminar(id: string, clienteId: string): Promise<boolean>;
}

export interface RepositorioTransferencias {
  porIdempotencia(clienteId: string, clave: string): Promise<Transferencia | null>;
  obtener(id: string, clienteId: string): Promise<Transferencia | null>;
  listar(clienteId: string, pagina: number, tamano: number): Promise<{ elementos: Transferencia[]; total: number }>;
  totalATercerosDesde(clienteId: string, moneda: Moneda, desde: Date): Promise<Dinero>;
}

export interface DatosEjecucion {
  clienteId: string;
  idempotencyKey: string;
  origen: CuentaOperable;
  destino: CuentaOperable;
  aliasDestino: string | null;
  monto: Dinero;
  concepto: string;
  nombreOrdenante: string;
}

/**
 * Unidad de trabajo: débito, crédito, movimientos y registro de la
 * transferencia se confirman juntos o no se confirma nada.
 */
export interface ProcesadorTransferencias {
  ejecutar(datos: DatosEjecucion): Promise<Transferencia>;
}

export interface Reloj {
  ahora(): Date;
}

/** Observador de resultados de negocio (métricas), desacoplado del caso de uso. */
export interface ObservadorTransferencias {
  registrar(resultado: 'completada' | 'rechazada' | 'repetida', codigo?: string): void;
}
