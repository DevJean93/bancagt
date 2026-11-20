import type { Dinero } from '@bancagt/plataforma';
import type { Cuenta, FiltroMovimientos, Movimiento, Pagina } from '../dominio/modelos.js';

export interface RepositorioCuentas {
  listarDeCliente(clienteId: string): Promise<Cuenta[]>;
  /** Devuelve la cuenta solo si pertenece al cliente (autorización a nivel de objeto). */
  obtenerDeCliente(cuentaId: string, clienteId: string): Promise<Cuenta | null>;
}

export interface RepositorioMovimientos {
  paginar(cuentaId: string, filtro: FiltroMovimientos, pagina: number, tamano: number): Promise<Pagina<Movimiento>>;
  enRango(cuentaId: string, desde: Date, hasta: Date): Promise<Movimiento[]>;
  /** Saldo contable de la cuenta justo antes de una fecha (o null si no hay movimientos previos). */
  saldoAntesDe(cuentaId: string, fecha: Date): Promise<Dinero | null>;
}
