import { Dinero, ErrorNoEncontrado, ErrorValidacion, type Moneda } from '@bancagt/plataforma';
import type { Categoria, Cuenta, FiltroMovimientos, Movimiento, Pagina } from '../dominio/modelos.js';
import type { RepositorioCuentas, RepositorioMovimientos } from './puertos.js';

/** Clase base: toda operación sobre una cuenta valida primero que sea del cliente. */
abstract class CasoUsoCuenta {
  constructor(protected readonly cuentas: RepositorioCuentas) {}

  protected async cuentaDelCliente(cuentaId: string, clienteId: string): Promise<Cuenta> {
    const cuenta = await this.cuentas.obtenerDeCliente(cuentaId, clienteId);
    // 404 (no 403) para no confirmar la existencia de cuentas ajenas.
    if (!cuenta) throw new ErrorNoEncontrado('Cuenta no encontrada');
    return cuenta;
  }
}

export interface PosicionConsolidada {
  cuentas: Cuenta[];
  totales: { moneda: Moneda; disponible: Dinero; contable: Dinero }[];
}

export class ConsultarPosicion {
  constructor(private readonly cuentas: RepositorioCuentas) {}

  async ejecutar(clienteId: string): Promise<PosicionConsolidada> {
    const cuentas = await this.cuentas.listarDeCliente(clienteId);
    const porMoneda = new Map<Moneda, { disponible: Dinero; contable: Dinero }>();
    for (const c of cuentas) {
      const t = porMoneda.get(c.moneda) ?? { disponible: Dinero.cero(c.moneda), contable: Dinero.cero(c.moneda) };
      porMoneda.set(c.moneda, {
        disponible: t.disponible.sumar(c.saldoDisponible),
        contable: t.contable.sumar(c.saldoContable),
      });
    }
    return { cuentas, totales: [...porMoneda].map(([moneda, t]) => ({ moneda, ...t })) };
  }
}

export class ConsultarCuenta extends CasoUsoCuenta {
  ejecutar(cuentaId: string, clienteId: string): Promise<Cuenta> {
    return this.cuentaDelCliente(cuentaId, clienteId);
  }
}

export class ConsultarMovimientos extends CasoUsoCuenta {
  constructor(
    cuentas: RepositorioCuentas,
    private readonly movimientos: RepositorioMovimientos,
  ) {
    super(cuentas);
  }

  async ejecutar(
    cuentaId: string,
    clienteId: string,
    filtro: FiltroMovimientos,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<Movimiento>> {
    if (filtro.desde && filtro.hasta && filtro.desde > filtro.hasta) {
      throw new ErrorValidacion('La fecha inicial no puede ser mayor que la final');
    }
    await this.cuentaDelCliente(cuentaId, clienteId);
    return this.movimientos.paginar(cuentaId, filtro, pagina, tamano);
  }
}

export interface EstadoCuenta {
  cuenta: Cuenta;
  periodo: { anio: number; mes: number; desde: Date; hasta: Date };
  saldoInicial: Dinero;
  totalCreditos: Dinero;
  totalDebitos: Dinero;
  saldoFinal: Dinero;
  porCategoria: { categoria: Categoria; total: Dinero }[];
  movimientos: Movimiento[];
}

export class GenerarEstadoCuenta extends CasoUsoCuenta {
  constructor(
    cuentas: RepositorioCuentas,
    private readonly movimientos: RepositorioMovimientos,
  ) {
    super(cuentas);
  }

  async ejecutar(cuentaId: string, clienteId: string, anio: number, mes: number): Promise<EstadoCuenta> {
    const cuenta = await this.cuentaDelCliente(cuentaId, clienteId);
    const desde = new Date(Date.UTC(anio, mes - 1, 1));
    const hasta = new Date(Date.UTC(anio, mes, 1));
    if (desde > new Date()) throw new ErrorValidacion('El periodo solicitado aún no ha iniciado');

    const movs = await this.movimientos.enRango(cuenta.id, desde, hasta);
    const cero = Dinero.cero(cuenta.moneda);
    const saldoInicial = (await this.movimientos.saldoAntesDe(cuenta.id, desde)) ?? cero;
    let creditos = cero;
    let debitos = cero;
    const categorias = new Map<Categoria, Dinero>();
    for (const m of movs) {
      if (m.tipo === 'CREDITO') creditos = creditos.sumar(m.monto);
      else {
        debitos = debitos.sumar(m.monto);
        categorias.set(m.categoria, (categorias.get(m.categoria) ?? cero).sumar(m.monto));
      }
    }
    return {
      cuenta,
      periodo: { anio, mes, desde, hasta },
      saldoInicial,
      totalCreditos: creditos,
      totalDebitos: debitos,
      saldoFinal: saldoInicial.sumar(creditos).restar(debitos),
      porCategoria: [...categorias]
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((a, b) => (b.total.esMayorQue(a.total) ? 1 : -1)),
      movimientos: movs,
    };
  }
}

export interface PuntoFlujo {
  fecha: string; // YYYY-MM-DD
  ingresos: Dinero;
  egresos: Dinero;
  saldo: Dinero;
}

/** Serie diaria de ingresos, egresos y saldo para la gráfica del portal. */
export class CalcularFlujo extends CasoUsoCuenta {
  constructor(
    cuentas: RepositorioCuentas,
    private readonly movimientos: RepositorioMovimientos,
  ) {
    super(cuentas);
  }

  async ejecutar(cuentaId: string, clienteId: string, dias: number): Promise<PuntoFlujo[]> {
    const cuenta = await this.cuentaDelCliente(cuentaId, clienteId);
    const hoy = new Date();
    const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - (dias - 1)));
    const movs = await this.movimientos.enRango(cuenta.id, desde, hoy);
    const cero = Dinero.cero(cuenta.moneda);
    let saldo = (await this.movimientos.saldoAntesDe(cuenta.id, desde)) ?? cero;

    const porDia = new Map<string, { ingresos: Dinero; egresos: Dinero }>();
    for (const m of movs) {
      const dia = m.fecha.toISOString().slice(0, 10);
      const p = porDia.get(dia) ?? { ingresos: cero, egresos: cero };
      porDia.set(dia, m.tipo === 'CREDITO' ? { ...p, ingresos: p.ingresos.sumar(m.monto) } : { ...p, egresos: p.egresos.sumar(m.monto) });
    }
    const serie: PuntoFlujo[] = [];
    for (let i = 0; i < dias; i++) {
      const fecha = new Date(desde.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const p = porDia.get(fecha) ?? { ingresos: cero, egresos: cero };
      saldo = saldo.sumar(p.ingresos).restar(p.egresos);
      serie.push({ fecha, ...p, saldo });
    }
    return serie;
  }
}
