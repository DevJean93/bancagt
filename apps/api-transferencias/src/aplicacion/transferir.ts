import {
  Dinero,
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorReglaNegocio,
  type Sesion,
} from '@bancagt/plataforma';
import { inicioDelDiaGuatemala, type CuentaOperable, type Destino, type Transferencia } from '../dominio/modelos.js';
import { reglasPorDefecto, type ReglaTransferencia } from '../dominio/reglas.js';
import type {
  ObservadorTransferencias,
  ProcesadorTransferencias,
  Reloj,
  RepositorioBeneficiarios,
  RepositorioCuentas,
  RepositorioTransferencias,
} from './puertos.js';

export interface SolicitudTransferencia {
  idempotencyKey: string;
  cuentaOrigenId: string;
  destino: Destino;
  monto: string;
  concepto: string;
}

export interface Resultado {
  transferencia: Transferencia;
  repetida: boolean;
}

/**
 * Caso de uso: realizar una transferencia.
 * 1. Idempotencia  2. Autorización de cuentas  3. Reglas (Strategy)
 * 4. Ejecución atómica (Unit of Work)
 */
export class RealizarTransferencia {
  constructor(
    private readonly cuentas: RepositorioCuentas,
    private readonly beneficiarios: RepositorioBeneficiarios,
    private readonly transferencias: RepositorioTransferencias,
    private readonly procesador: ProcesadorTransferencias,
    private readonly reloj: Reloj,
    private readonly observador: ObservadorTransferencias,
    private readonly reglas: ReglaTransferencia[] = reglasPorDefecto(),
  ) {}

  async ejecutar(sesion: Sesion, s: SolicitudTransferencia): Promise<Resultado> {
    const previa = await this.transferencias.porIdempotencia(sesion.clienteId, s.idempotencyKey);
    if (previa) return this.repetida(previa, s);

    const origen = await this.cuentas.deCliente(s.cuentaOrigenId, sesion.clienteId);
    if (!origen) throw new ErrorNoEncontrado('Cuenta de origen no encontrada');
    const { cuenta: destino, alias } = await this.resolverDestino(sesion.clienteId, s.destino);

    const monto = Dinero.de(s.monto, origen.moneda);
    const transferidoHoyATerceros = await this.transferencias.totalATercerosDesde(
      sesion.clienteId,
      origen.moneda,
      inicioDelDiaGuatemala(this.reloj.ahora()),
    );

    try {
      for (const regla of this.reglas) {
        regla.validar({ origen, destino, tipoDestino: s.destino.tipo, monto, transferidoHoyATerceros });
      }
      const transferencia = await this.procesador.ejecutar({
        clienteId: sesion.clienteId,
        idempotencyKey: s.idempotencyKey,
        origen,
        destino,
        aliasDestino: alias,
        monto,
        concepto: s.concepto,
        nombreOrdenante: sesion.nombre,
      });
      this.observador.registrar('completada');
      return { transferencia, repetida: false };
    } catch (err) {
      if (err instanceof ErrorReglaNegocio) this.observador.registrar('rechazada', err.codigo);
      throw err;
    }
  }

  private async resolverDestino(clienteId: string, d: Destino): Promise<{ cuenta: CuentaOperable; alias: string | null }> {
    if (d.tipo === 'PROPIA') {
      const cuenta = await this.cuentas.deCliente(d.cuentaId, clienteId);
      if (!cuenta) throw new ErrorNoEncontrado('Cuenta destino no encontrada');
      return { cuenta, alias: null };
    }
    const b = await this.beneficiarios.obtener(d.beneficiarioId, clienteId);
    if (!b) throw new ErrorNoEncontrado('Beneficiario no encontrado');
    return { cuenta: b.cuenta, alias: b.alias };
  }

  /** Reintento con la misma clave: se devuelve el resultado original si los datos coinciden. */
  private repetida(t: Transferencia, s: SolicitudTransferencia): Resultado {
    const mismaOperacion = t.origen.id === s.cuentaOrigenId && t.monto.aTexto() === Dinero.de(s.monto, t.monto.moneda).aTexto();
    if (!mismaOperacion) throw new ErrorConflicto('La Idempotency-Key ya se usó con datos distintos');
    this.observador.registrar('repetida');
    return { transferencia: t, repetida: true };
  }
}
