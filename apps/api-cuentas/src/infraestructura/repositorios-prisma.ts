// Adaptadores Prisma (Repository + Data Mapper): traducen filas del ORM a
// objetos de dominio. Ninguna consulta se escribe en SQL.
import { Dinero, type Moneda } from '@bancagt/plataforma';
import type { Prisma, PrismaClient } from '@bancagt/db-core';
import type { Cuenta, FiltroMovimientos, Movimiento, Pagina } from '../dominio/modelos.js';
import type { RepositorioCuentas, RepositorioMovimientos } from '../aplicacion/puertos.js';

type FilaCuenta = Prisma.CuentaGetPayload<object>;
type FilaMovimiento = Prisma.MovimientoGetPayload<object>;

const dinero = (d: Prisma.Decimal, moneda: Moneda) => Dinero.de(d.toFixed(2), moneda);

export const aCuenta = (c: FilaCuenta): Cuenta => ({
  id: c.id,
  numero: c.numero,
  clienteId: c.clienteId,
  tipo: c.tipo,
  moneda: c.moneda,
  alias: c.alias,
  estado: c.estado,
  saldoContable: dinero(c.saldoContable, c.moneda),
  saldoDisponible: dinero(c.saldoDisponible, c.moneda),
  abiertaEn: c.abiertaEn,
});

const aMovimiento = (m: FilaMovimiento, moneda: Moneda): Movimiento => ({
  id: m.id.toString(),
  fecha: m.fecha,
  tipo: m.tipo,
  categoria: m.categoria,
  descripcion: m.descripcion,
  monto: dinero(m.monto, moneda),
  saldoPosterior: dinero(m.saldoPosterior, moneda),
  referencia: m.referencia,
});

export class RepositorioCuentasPrisma implements RepositorioCuentas {
  constructor(private readonly db: PrismaClient) {}

  async listarDeCliente(clienteId: string): Promise<Cuenta[]> {
    const filas = await this.db.cuenta.findMany({
      where: { clienteId, estado: { not: 'CERRADA' } },
      orderBy: [{ tipo: 'asc' }, { abiertaEn: 'asc' }],
    });
    return filas.map(aCuenta);
  }

  async obtenerDeCliente(cuentaId: string, clienteId: string): Promise<Cuenta | null> {
    const fila = await this.db.cuenta.findFirst({ where: { id: cuentaId, clienteId } });
    return fila ? aCuenta(fila) : null;
  }
}

export class RepositorioMovimientosPrisma implements RepositorioMovimientos {
  constructor(private readonly db: PrismaClient) {}

  private async monedaDe(cuentaId: string): Promise<Moneda> {
    const c = await this.db.cuenta.findUniqueOrThrow({ where: { id: cuentaId }, select: { moneda: true } });
    return c.moneda;
  }

  async paginar(cuentaId: string, f: FiltroMovimientos, pagina: number, tamano: number): Promise<Pagina<Movimiento>> {
    const where: Prisma.MovimientoWhereInput = {
      cuentaId,
      ...(f.tipo ? { tipo: f.tipo } : {}),
      ...(f.categoria ? { categoria: f.categoria } : {}),
      ...(f.texto ? { descripcion: { contains: f.texto, mode: 'insensitive' as const } } : {}),
      ...(f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: f.desde } : {}), ...(f.hasta ? { lte: f.hasta } : {}) } } : {}),
    };
    const [moneda, total, filas] = await Promise.all([
      this.monedaDe(cuentaId),
      this.db.movimiento.count({ where }),
      this.db.movimiento.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
    ]);
    return { elementos: filas.map((m) => aMovimiento(m, moneda)), total, pagina, tamano };
  }

  async enRango(cuentaId: string, desde: Date, hasta: Date): Promise<Movimiento[]> {
    const [moneda, filas] = await Promise.all([
      this.monedaDe(cuentaId),
      this.db.movimiento.findMany({
        where: { cuentaId, fecha: { gte: desde, lt: hasta } },
        orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return filas.map((m) => aMovimiento(m, moneda));
  }

  async saldoAntesDe(cuentaId: string, fecha: Date): Promise<Dinero | null> {
    const [moneda, ultimo] = await Promise.all([
      this.monedaDe(cuentaId),
      this.db.movimiento.findFirst({
        where: { cuentaId, fecha: { lt: fecha } },
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        select: { saldoPosterior: true },
      }),
    ]);
    return ultimo ? dinero(ultimo.saldoPosterior, moneda) : null;
  }
}
