// Reglas de negocio de una transferencia (patrón Strategy).
// Cada regla tiene una sola responsabilidad (SRP). Agregar una regla nueva no
// obliga a modificar el caso de uso (Open/Closed): basta con registrarla.
import { Dinero, ErrorReglaNegocio, type Moneda } from '@bancagt/plataforma';
import type { CuentaOperable, Destino } from './modelos.js';

export interface ContextoTransferencia {
  origen: CuentaOperable;
  destino: CuentaOperable;
  tipoDestino: Destino['tipo'];
  monto: Dinero;
  /** Suma de transferencias a terceros del cliente en el día (misma moneda). */
  transferidoHoyATerceros: Dinero;
}

export interface ReglaTransferencia {
  validar(ctx: ContextoTransferencia): void;
}

export interface Limites {
  porOperacion: Dinero;
  diarioTerceros: Dinero;
  minimo: Dinero;
}

/** Límites por moneda (configurables; en un banco real vendrían de un catálogo). */
export const LIMITES: Record<Moneda, Limites> = {
  GTQ: { porOperacion: Dinero.de('50000', 'GTQ'), diarioTerceros: Dinero.de('75000', 'GTQ'), minimo: Dinero.de('1', 'GTQ') },
  USD: { porOperacion: Dinero.de('6500', 'USD'), diarioTerceros: Dinero.de('10000', 'USD'), minimo: Dinero.de('1', 'USD') },
};

export class ReglaCuentasActivas implements ReglaTransferencia {
  validar({ origen, destino }: ContextoTransferencia): void {
    if (origen.estado !== 'ACTIVA') throw new ErrorReglaNegocio('CUENTA_ORIGEN_INACTIVA', 'La cuenta de origen no está activa');
    if (destino.estado !== 'ACTIVA') throw new ErrorReglaNegocio('CUENTA_DESTINO_INACTIVA', 'La cuenta destino no puede recibir fondos');
  }
}

export class ReglaCuentasDistintas implements ReglaTransferencia {
  validar({ origen, destino }: ContextoTransferencia): void {
    if (origen.id === destino.id) throw new ErrorReglaNegocio('MISMA_CUENTA', 'La cuenta de origen y destino deben ser distintas');
  }
}

export class ReglaMismaMoneda implements ReglaTransferencia {
  validar({ origen, destino }: ContextoTransferencia): void {
    if (origen.moneda !== destino.moneda) {
      throw new ErrorReglaNegocio('MONEDA_DISTINTA', `Solo se puede transferir entre cuentas en ${origen.moneda}`);
    }
  }
}

export class ReglaMontoMinimo implements ReglaTransferencia {
  validar({ monto }: ContextoTransferencia): void {
    const minimo = LIMITES[monto.moneda].minimo;
    if (minimo.esMayorQue(monto)) throw new ErrorReglaNegocio('MONTO_MINIMO', `El monto mínimo es ${minimo.aTexto()} ${monto.moneda}`);
  }
}

export class ReglaLimitePorOperacion implements ReglaTransferencia {
  validar({ monto }: ContextoTransferencia): void {
    const limite = LIMITES[monto.moneda].porOperacion;
    if (monto.esMayorQue(limite)) {
      throw new ErrorReglaNegocio('LIMITE_OPERACION', `El monto supera el límite por operación (${limite.aTexto()} ${monto.moneda})`, {
        limite: limite.aTexto(),
      });
    }
  }
}

/** Control antifraude: tope diario acumulado para transferencias a terceros. */
export class ReglaLimiteDiarioTerceros implements ReglaTransferencia {
  validar({ tipoDestino, monto, transferidoHoyATerceros }: ContextoTransferencia): void {
    if (tipoDestino !== 'BENEFICIARIO') return;
    const limite = LIMITES[monto.moneda].diarioTerceros;
    const disponible = limite.restar(transferidoHoyATerceros);
    if (monto.esMayorQue(disponible)) {
      throw new ErrorReglaNegocio('LIMITE_DIARIO', `Supera el límite diario a terceros. Disponible hoy: ${disponible.aTexto()} ${monto.moneda}`, {
        disponibleHoy: disponible.aTexto(),
      });
    }
  }
}

/** Verificación temprana (mensaje claro). La garantía real es la actualización atómica condicional. */
export class ReglaSaldoSuficiente implements ReglaTransferencia {
  validar({ origen, monto }: ContextoTransferencia): void {
    if (monto.esMayorQue(origen.saldoDisponible)) {
      throw new ErrorReglaNegocio('SALDO_INSUFICIENTE', 'Saldo disponible insuficiente');
    }
  }
}

/** Cadena de reglas en el orden en que deben evaluarse. */
export const reglasPorDefecto = (): ReglaTransferencia[] => [
  new ReglaCuentasDistintas(),
  new ReglaCuentasActivas(),
  new ReglaMismaMoneda(),
  new ReglaMontoMinimo(),
  new ReglaLimitePorOperacion(),
  new ReglaLimiteDiarioTerceros(),
  new ReglaSaldoSuficiente(),
];
