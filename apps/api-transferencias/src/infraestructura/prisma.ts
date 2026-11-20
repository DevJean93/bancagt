// Adaptadores Prisma: repositorios (lectura) y unidad de trabajo (escritura).
import { Dinero, ErrorReglaNegocio, type Moneda } from '@bancagt/plataforma';
import { Prisma, type PrismaClient } from '@bancagt/db-core';
import {
  enmascararNumero,
  enmascararTitular,
  referenciaDe,
  type Beneficiario,
  type CuentaOperable,
  type Transferencia,
} from '../dominio/modelos.js';
import type {
  DatosEjecucion,
  ProcesadorTransferencias,
  RepositorioBeneficiarios,
  RepositorioCuentas,
  RepositorioTransferencias,
} from '../aplicacion/puertos.js';

// ---------- Data Mappers ----------
const conTitular = { cliente: { select: { nombres: true, apellidos: true } } } as const;
type FilaCuenta = Prisma.CuentaGetPayload<{ include: typeof conTitular }>;

const aCuenta = (c: FilaCuenta): CuentaOperable => ({
  id: c.id,
  numero: c.numero,
  clienteId: c.clienteId,
  tipo: c.tipo,
  moneda: c.moneda,
  estado: c.estado,
  saldoDisponible: Dinero.de(c.saldoDisponible.toFixed(2), c.moneda),
  titular: `${c.cliente.nombres} ${c.cliente.apellidos}`,
});

const incluirTransferencia = {
  cuentaOrigen: { include: conTitular },
  cuentaDestino: { include: conTitular },
} as const;
type FilaTransferencia = Prisma.TransferenciaGetPayload<{ include: typeof incluirTransferencia }>;

const aTransferencia = (t: FilaTransferencia, aliasDestino: string | null = null): Transferencia => ({
  id: t.id,
  referencia: referenciaDe(t.numero),
  clienteId: t.clienteId,
  idempotencyKey: t.idempotencyKey,
  origen: aCuenta(t.cuentaOrigen),
  destino: aCuenta(t.cuentaDestino),
  aliasDestino,
  monto: Dinero.de(t.monto.toFixed(2), t.moneda),
  concepto: t.concepto,
  estado: t.estado,
  creadaEn: t.creadaEn,
});

// ---------- Repositorios ----------
export class RepositorioCuentasPrisma implements RepositorioCuentas {
  constructor(private readonly db: PrismaClient) {}

  async deCliente(cuentaId: string, clienteId: string): Promise<CuentaOperable | null> {
    const c = await this.db.cuenta.findFirst({ where: { id: cuentaId, clienteId }, include: conTitular });
    return c ? aCuenta(c) : null;
  }

  async porNumero(numero: string): Promise<CuentaOperable | null> {
    const c = await this.db.cuenta.findUnique({ where: { numero }, include: conTitular });
    return c ? aCuenta(c) : null;
  }
}

const conCuenta = { cuenta: { include: conTitular } } as const;
type FilaBeneficiario = Prisma.BeneficiarioGetPayload<{ include: typeof conCuenta }>;
const aBeneficiario = (b: FilaBeneficiario): Beneficiario => ({
  id: b.id,
  alias: b.alias,
  cuenta: aCuenta(b.cuenta),
  creadoEn: b.creadoEn,
});

export class RepositorioBeneficiariosPrisma implements RepositorioBeneficiarios {
  constructor(private readonly db: PrismaClient) {}

  async listar(clienteId: string): Promise<Beneficiario[]> {
    const filas = await this.db.beneficiario.findMany({ where: { clienteId }, include: conCuenta, orderBy: { alias: 'asc' } });
    return filas.map(aBeneficiario);
  }

  async obtener(id: string, clienteId: string): Promise<Beneficiario | null> {
    const b = await this.db.beneficiario.findFirst({ where: { id, clienteId }, include: conCuenta });
    return b ? aBeneficiario(b) : null;
  }

  contar(clienteId: string): Promise<number> {
    return this.db.beneficiario.count({ where: { clienteId } });
  }

  async existe(clienteId: string, cuentaId: string): Promise<boolean> {
    return (await this.db.beneficiario.count({ where: { clienteId, cuentaId } })) > 0;
  }

  async crear(clienteId: string, cuentaId: string, alias: string): Promise<Beneficiario> {
    return aBeneficiario(await this.db.beneficiario.create({ data: { clienteId, cuentaId, alias }, include: conCuenta }));
  }

  async eliminar(id: string, clienteId: string): Promise<boolean> {
    return (await this.db.beneficiario.deleteMany({ where: { id, clienteId } })).count > 0;
  }
}

export class RepositorioTransferenciasPrisma implements RepositorioTransferencias {
  constructor(private readonly db: PrismaClient) {}

  async porIdempotencia(clienteId: string, clave: string): Promise<Transferencia | null> {
    const t = await this.db.transferencia.findUnique({
      where: { clienteId_idempotencyKey: { clienteId, idempotencyKey: clave } },
      include: incluirTransferencia,
    });
    return t ? aTransferencia(t) : null;
  }

  async obtener(id: string, clienteId: string): Promise<Transferencia | null> {
    const t = await this.db.transferencia.findFirst({ where: { id, clienteId }, include: incluirTransferencia });
    if (!t) return null;
    const b = await this.db.beneficiario.findFirst({ where: { clienteId, cuentaId: t.cuentaDestinoId }, select: { alias: true } });
    return aTransferencia(t, b?.alias ?? null);
  }

  async listar(clienteId: string, pagina: number, tamano: number) {
    const where = { clienteId };
    const [total, filas, beneficiarios] = await Promise.all([
      this.db.transferencia.count({ where }),
      this.db.transferencia.findMany({
        where,
        include: incluirTransferencia,
        orderBy: { creadaEn: 'desc' },
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
      this.db.beneficiario.findMany({ where, select: { cuentaId: true, alias: true } }),
    ]);
    const alias = new Map(beneficiarios.map((b) => [b.cuentaId, b.alias]));
    return { total, elementos: filas.map((t) => aTransferencia(t, alias.get(t.cuentaDestinoId) ?? null)) };
  }

  async totalATercerosDesde(clienteId: string, moneda: Moneda, desde: Date): Promise<Dinero> {
    const r = await this.db.transferencia.aggregate({
      _sum: { monto: true },
      where: {
        clienteId,
        moneda,
        estado: 'COMPLETADA',
        creadaEn: { gte: desde },
        cuentaDestino: { clienteId: { not: clienteId } },
      },
    });
    return Dinero.de(r._sum.monto?.toFixed(2) ?? '0', moneda);
  }
}

// ---------- Unidad de trabajo ----------
const esError = (e: unknown, codigo: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === codigo;

export class ProcesadorTransferenciasPrisma implements ProcesadorTransferencias {
  constructor(
    private readonly db: PrismaClient,
    private readonly repo: RepositorioTransferencias,
  ) {}

  async ejecutar(d: DatosEjecucion): Promise<Transferencia> {
    try {
      return await this.db.$transaction(async (tx) => this.enTransaccion(tx, d), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 5000,
      });
    } catch (e) {
      // Carrera: dos peticiones con la misma Idempotency-Key → gana la primera.
      if (esError(e, 'P2002')) {
        const previa = await this.repo.porIdempotencia(d.clienteId, d.idempotencyKey);
        if (previa) return previa;
      }
      throw e;
    }
  }

  private async enTransaccion(tx: Prisma.TransactionClient, d: DatosEjecucion): Promise<Transferencia> {
    const monto = d.monto.aTexto();

    // Débito ATÓMICO y CONDICIONAL: un solo UPDATE ... WHERE saldo_disponible >= monto.
    // Si dos transferencias compiten por el mismo saldo, solo una lo logra.
    const debitar = () =>
      tx.cuenta
        .update({
          where: { id: d.origen.id, estado: 'ACTIVA', saldoDisponible: { gte: monto } },
          data: { saldoDisponible: { decrement: monto }, saldoContable: { decrement: monto } },
        })
        .catch((e: unknown) => {
          if (esError(e, 'P2025')) throw new ErrorReglaNegocio('SALDO_INSUFICIENTE', 'Saldo disponible insuficiente');
          throw e;
        });
    const acreditar = () =>
      tx.cuenta.update({
        where: { id: d.destino.id, estado: 'ACTIVA' },
        data: { saldoDisponible: { increment: monto }, saldoContable: { increment: monto } },
      });

    // Orden fijo de bloqueo (por id) para evitar interbloqueos entre A→B y B→A.
    const [origen, destino] =
      d.origen.id < d.destino.id
        ? [await debitar(), await acreditar()]
        : await acreditar().then(async (dest) => [await debitar(), dest] as const);

    const t = await tx.transferencia.create({
      data: {
        clienteId: d.clienteId,
        idempotencyKey: d.idempotencyKey,
        cuentaOrigenId: d.origen.id,
        cuentaDestinoId: d.destino.id,
        monto,
        moneda: d.origen.moneda,
        concepto: d.concepto,
        estado: 'COMPLETADA',
      },
      include: incluirTransferencia,
    });

    const referencia = referenciaDe(t.numero);
    const propia = d.destino.clienteId === d.clienteId;
    const haciaDescripcion = d.aliasDestino ?? `cuenta propia ${enmascararNumero(d.destino.numero)}`;
    const desdeDescripcion = propia ? `cuenta propia ${enmascararNumero(d.origen.numero)}` : enmascararTitular(d.nombreOrdenante);

    await tx.movimiento.createMany({
      data: [
        {
          cuentaId: d.origen.id,
          tipo: 'DEBITO',
          categoria: 'TRANSFERENCIA',
          descripcion: `Transferencia a ${haciaDescripcion} · ${d.concepto}`.slice(0, 120),
          monto,
          saldoPosterior: origen.saldoContable,
          referencia,
          transferenciaId: t.id,
        },
        {
          cuentaId: d.destino.id,
          tipo: 'CREDITO',
          categoria: 'TRANSFERENCIA',
          descripcion: `Transferencia de ${desdeDescripcion} · ${d.concepto}`.slice(0, 120),
          monto,
          saldoPosterior: destino.saldoContable,
          referencia,
          transferenciaId: t.id,
        },
      ],
    });
    return aTransferencia(t, d.aliasDestino);
  }
}
