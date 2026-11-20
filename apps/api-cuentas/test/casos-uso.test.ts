import { describe, expect, it } from 'vitest';
import { Dinero, ErrorNoEncontrado, ErrorValidacion } from '@bancagt/plataforma';
import {
  CalcularFlujo,
  ConsultarCuenta,
  ConsultarMovimientos,
  ConsultarPosicion,
  GenerarEstadoCuenta,
} from '../src/aplicacion/casos-uso.js';
import type { RepositorioCuentas, RepositorioMovimientos } from '../src/aplicacion/puertos.js';
import { enmascararNumero, type Cuenta, type Movimiento } from '../src/dominio/modelos.js';

const q = (v: string) => Dinero.de(v, 'GTQ');
const cuenta = (id: string, clienteId: string, disponible: string, contable = disponible, moneda: 'GTQ' | 'USD' = 'GTQ'): Cuenta => ({
  id, numero: `30000000${id.slice(-2)}`, clienteId, tipo: 'MONETARIA', moneda, alias: null, estado: 'ACTIVA',
  saldoContable: Dinero.de(contable, moneda), saldoDisponible: Dinero.de(disponible, moneda), abiertaEn: new Date('2026-01-01'),
});
const mov = (fecha: string, tipo: 'CREDITO' | 'DEBITO', monto: string, saldo: string, categoria: Movimiento['categoria'] = 'OTROS'): Movimiento => ({
  id: fecha, fecha: new Date(fecha), tipo, categoria, descripcion: 'x', monto: q(monto), saldoPosterior: q(saldo), referencia: null,
});

const cuentas = [cuenta('c-01', 'cli-1', '900', '1000'), cuenta('c-02', 'cli-1', '50'), cuenta('c-03', 'cli-1', '20', '20', 'USD'), cuenta('c-09', 'cli-2', '1')];
const repoCuentas: RepositorioCuentas = {
  listarDeCliente: async (cli) => cuentas.filter((c) => c.clienteId === cli),
  obtenerDeCliente: async (id, cli) => cuentas.find((c) => c.id === id && c.clienteId === cli) ?? null,
};
const movimientos = [
  mov('2026-10-28T15:00:00Z', 'CREDITO', '500', '500'),
  mov('2026-11-02T15:00:00Z', 'DEBITO', '120', '380', 'SUPERMERCADO'),
  mov('2026-11-05T15:00:00Z', 'DEBITO', '80', '300', 'SERVICIOS'),
  mov('2026-11-15T15:00:00Z', 'CREDITO', '700', '1000', 'SALARIO'),
  mov('2026-11-16T15:00:00Z', 'DEBITO', '200', '800', 'SUPERMERCADO'),
];
const repoMovs: RepositorioMovimientos = {
  paginar: async (_c, _f, pagina, tamano) => ({ elementos: movimientos.slice(0, tamano), total: movimientos.length, pagina, tamano }),
  enRango: async (_c, desde, hasta) => movimientos.filter((m) => m.fecha >= desde && m.fecha < hasta),
  saldoAntesDe: async (_c, fecha) => [...movimientos].reverse().find((m) => m.fecha < fecha)?.saldoPosterior ?? null,
};

describe('ConsultarPosicion', () => {
  it('suma saldos por moneda y solo incluye cuentas del cliente', async () => {
    const p = await new ConsultarPosicion(repoCuentas).ejecutar('cli-1');
    expect(p.cuentas).toHaveLength(3);
    expect(p.totales.find((t) => t.moneda === 'GTQ')?.disponible.aTexto()).toBe('950.00');
    expect(p.totales.find((t) => t.moneda === 'GTQ')?.contable.aTexto()).toBe('1050.00');
    expect(p.totales.find((t) => t.moneda === 'USD')?.disponible.aTexto()).toBe('20.00');
  });
});

describe('ConsultarCuenta / ConsultarMovimientos', () => {
  it('responde 404 para cuentas de otro cliente (autorización a nivel de objeto)', async () => {
    await expect(new ConsultarCuenta(repoCuentas).ejecutar('c-09', 'cli-1')).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });

  it('valida que el rango de fechas sea coherente', async () => {
    const caso = new ConsultarMovimientos(repoCuentas, repoMovs);
    await expect(caso.ejecutar('c-01', 'cli-1', { desde: new Date('2026-11-10'), hasta: new Date('2026-11-01') }, 1, 10))
      .rejects.toBeInstanceOf(ErrorValidacion);
    const r = await caso.ejecutar('c-01', 'cli-1', {}, 1, 3);
    expect(r.elementos).toHaveLength(3);
    expect(r.total).toBe(5);
  });
});

describe('GenerarEstadoCuenta', () => {
  it('calcula saldo inicial, créditos, débitos, saldo final y gasto por categoría', async () => {
    const e = await new GenerarEstadoCuenta(repoCuentas, repoMovs).ejecutar('c-01', 'cli-1', 2026, 11);
    expect(e.saldoInicial.aTexto()).toBe('500.00');
    expect(e.totalCreditos.aTexto()).toBe('700.00');
    expect(e.totalDebitos.aTexto()).toBe('400.00');
    expect(e.saldoFinal.aTexto()).toBe('800.00');
    expect(e.porCategoria[0]).toMatchObject({ categoria: 'SUPERMERCADO' });
    expect(e.porCategoria[0]?.total.aTexto()).toBe('320.00');
    expect(e.movimientos).toHaveLength(4);
  });

  it('rechaza periodos futuros', async () => {
    await expect(new GenerarEstadoCuenta(repoCuentas, repoMovs).ejecutar('c-01', 'cli-1', 2099, 1)).rejects.toBeInstanceOf(ErrorValidacion);
  });
});

describe('CalcularFlujo', () => {
  it('devuelve un punto por día y el saldo acumulado es coherente', async () => {
    const serie = await new CalcularFlujo(repoCuentas, repoMovs).ejecutar('c-01', 'cli-1', 30);
    expect(serie).toHaveLength(30);
    for (const p of serie) {
      expect(Number(p.saldo.aTexto())).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('enmascararNumero', () => {
  it('muestra solo los últimos 4 dígitos', () => {
    expect(enmascararNumero('3012345678')).toBe('•••• 5678');
  });
});
