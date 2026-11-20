import { describe, expect, it } from 'vitest';
import { Dinero, ErrorConflicto, ErrorNoEncontrado, ErrorReglaNegocio, type Sesion } from '@bancagt/plataforma';
import { RealizarTransferencia } from '../src/aplicacion/transferir.js';
import type {
  DatosEjecucion,
  ObservadorTransferencias,
  ProcesadorTransferencias,
  RepositorioBeneficiarios,
  RepositorioCuentas,
  RepositorioTransferencias,
} from '../src/aplicacion/puertos.js';
import { inicioDelDiaGuatemala, type CuentaOperable, type Transferencia } from '../src/dominio/modelos.js';

const cuenta = (id: string, clienteId: string, saldo: string, moneda: 'GTQ' | 'USD' = 'GTQ'): CuentaOperable => ({
  id, numero: `30000000${id.slice(-2)}`, clienteId, tipo: 'MONETARIA', moneda, estado: 'ACTIVA',
  saldoDisponible: Dinero.de(saldo, moneda), titular: 'Cliente Demo',
});

function escenario(transferidoHoy = '0') {
  const cuentas = new Map([
    ['c-01', cuenta('c-01', 'cli-1', '1000')],
    ['c-02', cuenta('c-02', 'cli-1', '50')],
    ['c-03', cuenta('c-03', 'cli-2', '10')],
    ['c-04', cuenta('c-04', 'cli-1', '500', 'USD')],
  ]);
  const ejecutadas: DatosEjecucion[] = [];
  const guardadas = new Map<string, Transferencia>();
  const resultados: string[] = [];

  const repoCuentas: RepositorioCuentas = {
    deCliente: async (id, cli) => (cuentas.get(id)?.clienteId === cli ? cuentas.get(id)! : null),
    porNumero: async () => null,
  };
  const repoBenef: RepositorioBeneficiarios = {
    obtener: async (id, cli) => (id === 'b-1' && cli === 'cli-1' ? { id, alias: 'Amigo', cuenta: cuentas.get('c-03')!, creadoEn: new Date() } : null),
    listar: async () => [], contar: async () => 0, existe: async () => false,
    crear: async () => { throw new Error('no usado'); }, eliminar: async () => false,
  };
  const repoTrf: RepositorioTransferencias = {
    porIdempotencia: async (cli, k) => guardadas.get(`${cli}:${k}`) ?? null,
    obtener: async () => null, listar: async () => ({ elementos: [], total: 0 }),
    totalATercerosDesde: async (_c, moneda) => Dinero.de(transferidoHoy, moneda),
  };
  const procesador: ProcesadorTransferencias = {
    ejecutar: async (d) => {
      ejecutadas.push(d);
      const t: Transferencia = {
        id: 't-1', referencia: 'TRF-00000001', clienteId: d.clienteId, idempotencyKey: d.idempotencyKey,
        origen: d.origen, destino: d.destino, aliasDestino: d.aliasDestino, monto: d.monto,
        concepto: d.concepto, estado: 'COMPLETADA', creadaEn: new Date(),
      };
      guardadas.set(`${d.clienteId}:${d.idempotencyKey}`, t);
      return t;
    },
  };
  const observador: ObservadorTransferencias = { registrar: (r, c) => resultados.push(c ? `${r}:${c}` : r) };
  const caso = new RealizarTransferencia(repoCuentas, repoBenef, repoTrf, procesador, { ahora: () => new Date() }, observador);
  return { caso, ejecutadas, resultados };
}

const sesion: Sesion = { usuarioId: 'u-1', clienteId: 'cli-1', nombre: 'María López', ultimoAcceso: null, expiraEn: 0 };
const base = { idempotencyKey: 'clave-000001', cuentaOrigenId: 'c-01', concepto: 'Prueba' };

describe('RealizarTransferencia', () => {
  it('transfiere entre cuentas propias', async () => {
    const { caso, ejecutadas } = escenario();
    const r = await caso.ejecutar(sesion, { ...base, destino: { tipo: 'PROPIA', cuentaId: 'c-02' }, monto: '250.75' });
    expect(r.repetida).toBe(false);
    expect(ejecutadas[0]?.monto.aTexto()).toBe('250.75');
  });

  it('es idempotente: la misma clave no vuelve a ejecutar', async () => {
    const { caso, ejecutadas } = escenario();
    const s = { ...base, destino: { tipo: 'PROPIA' as const, cuentaId: 'c-02' }, monto: '10' };
    await caso.ejecutar(sesion, s);
    const r = await caso.ejecutar(sesion, s);
    expect(r.repetida).toBe(true);
    expect(ejecutadas).toHaveLength(1);
    await expect(caso.ejecutar(sesion, { ...s, monto: '11' })).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('no permite usar cuentas de otro cliente como origen (404)', async () => {
    const { caso } = escenario();
    await expect(caso.ejecutar(sesion, { ...base, cuentaOrigenId: 'c-03', destino: { tipo: 'PROPIA', cuentaId: 'c-02' }, monto: '1' }))
      .rejects.toBeInstanceOf(ErrorNoEncontrado);
  });

  it.each([
    ['SALDO_INSUFICIENTE', { destino: { tipo: 'PROPIA' as const, cuentaId: 'c-02' }, monto: '1000.01' }],
    ['MONEDA_DISTINTA', { destino: { tipo: 'PROPIA' as const, cuentaId: 'c-04' }, monto: '10' }],
    ['MISMA_CUENTA', { destino: { tipo: 'PROPIA' as const, cuentaId: 'c-01' }, monto: '10' }],
    ['MONTO_MINIMO', { destino: { tipo: 'PROPIA' as const, cuentaId: 'c-02' }, monto: '0.50' }],
  ])('rechaza con la regla %s', async (codigo, datos) => {
    const { caso, ejecutadas, resultados } = escenario();
    const err = await caso.ejecutar(sesion, { ...base, ...datos }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorReglaNegocio);
    expect((err as ErrorReglaNegocio).codigo).toBe(codigo);
    expect(ejecutadas).toHaveLength(0);
    expect(resultados).toEqual([`rechazada:${codigo}`]);
  });

  it('aplica el límite diario solo a transferencias a terceros', async () => {
    const { caso } = escenario('74900');
    const aTercero = caso.ejecutar(sesion, { ...base, destino: { tipo: 'BENEFICIARIO', beneficiarioId: 'b-1' }, monto: '200' });
    await expect(aTercero).rejects.toMatchObject({ codigo: 'LIMITE_DIARIO' });
    const propia = await caso.ejecutar(sesion, { ...base, idempotencyKey: 'clave-000002', destino: { tipo: 'PROPIA', cuentaId: 'c-02' }, monto: '200' });
    expect(propia.repetida).toBe(false);
  });
});

describe('inicioDelDiaGuatemala', () => {
  it('usa medianoche de Guatemala (06:00 UTC)', () => {
    expect(inicioDelDiaGuatemala(new Date('2026-11-20T03:00:00Z')).toISOString()).toBe('2026-11-19T06:00:00.000Z');
    expect(inicioDelDiaGuatemala(new Date('2026-11-20T07:00:00Z')).toISOString()).toBe('2026-11-20T06:00:00.000Z');
  });
});
