import { describe, expect, it } from 'vitest';
import { Dinero, ErrorNoEncontrado, ErrorReglaNegocio } from '@bancagt/plataforma';
import { ConsultarLimites, GestionarBeneficiarios } from '../src/aplicacion/consultas.js';
import type { RepositorioBeneficiarios, RepositorioCuentas, RepositorioTransferencias } from '../src/aplicacion/puertos.js';
import { enmascararTitular, referenciaDe, type Beneficiario, type CuentaOperable } from '../src/dominio/modelos.js';

const cuenta = (id: string, numero: string, clienteId: string, titular: string): CuentaOperable => ({
  id, numero, clienteId, tipo: 'MONETARIA', moneda: 'GTQ', estado: 'ACTIVA', saldoDisponible: Dinero.de('100', 'GTQ'), titular,
});
const cuentas = [cuenta('c-1', '3000000001', 'cli-1', 'María Fernanda López García'), cuenta('c-2', '3000000002', 'cli-2', 'José Antonio Pérez Morales')];

function escenario() {
  const guardados: Beneficiario[] = [];
  const repoCuentas: RepositorioCuentas = {
    deCliente: async () => null,
    porNumero: async (n) => cuentas.find((c) => c.numero === n) ?? null,
  };
  const repoBenef: RepositorioBeneficiarios = {
    listar: async () => guardados,
    obtener: async (id) => guardados.find((b) => b.id === id) ?? null,
    contar: async () => guardados.length,
    existe: async (_cli, cuentaId) => guardados.some((b) => b.cuenta.id === cuentaId),
    crear: async (_cli, cuentaId, alias) => {
      const b = { id: `b-${guardados.length + 1}`, alias, cuenta: cuentas.find((c) => c.id === cuentaId)!, creadoEn: new Date() };
      guardados.push(b);
      return b;
    },
    eliminar: async (id) => {
      const i = guardados.findIndex((b) => b.id === id);
      if (i < 0) return false;
      guardados.splice(i, 1);
      return true;
    },
  };
  return { caso: new GestionarBeneficiarios(repoCuentas, repoBenef), guardados };
}

describe('GestionarBeneficiarios', () => {
  it('consulta el titular enmascarado antes de registrar', async () => {
    const { caso } = escenario();
    const t = await caso.consultarTitular('3000000002', 'cli-1');
    expect(t.titular).toBe('José P.');
    expect(t.esPropia).toBe(false);
    expect(t.numeroEnmascarado).toBe('•••• 0002');
  });

  it('registra un tercero, evita duplicados y cuentas propias', async () => {
    const { caso, guardados } = escenario();
    await caso.agregar('cli-1', '3000000002', 'José');
    expect(guardados).toHaveLength(1);
    await expect(caso.agregar('cli-1', '3000000002', 'Otra vez')).rejects.toMatchObject({ codigo: 'BENEFICIARIO_DUPLICADO' });
    await expect(caso.agregar('cli-1', '3000000001', 'Yo')).rejects.toMatchObject({ codigo: 'CUENTA_PROPIA' });
    await expect(caso.agregar('cli-1', '9999999999', 'Nadie')).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });

  it('elimina y responde 404 si no existe', async () => {
    const { caso } = escenario();
    const b = await caso.agregar('cli-1', '3000000002', 'José');
    await caso.eliminar(b.id, 'cli-1');
    await expect(caso.eliminar(b.id, 'cli-1')).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});

describe('ConsultarLimites', () => {
  it('calcula lo disponible hoy y nunca devuelve negativo', async () => {
    const repo: RepositorioTransferencias = {
      porIdempotencia: async () => null, obtener: async () => null, listar: async () => ({ elementos: [], total: 0 }),
      totalATercerosDesde: async (_c, moneda) => Dinero.de(moneda === 'GTQ' ? '25000' : '12000', moneda),
    };
    const l = await new ConsultarLimites(repo, { ahora: () => new Date() }).ejecutar('cli-1');
    expect(l.find((x) => x.moneda === 'GTQ')?.disponibleHoy).toBe('50000.00');
    expect(l.find((x) => x.moneda === 'USD')?.disponibleHoy).toBe('0.00');
  });
});

describe('utilidades de dominio', () => {
  it('formatea referencias y enmascara titulares', () => {
    expect(referenciaDe(42n)).toBe('TRF-00000042');
    expect(enmascararTitular('Ana Lucía García Herrera')).toBe('Ana G.');
    expect(enmascararTitular('Pedro')).toBe('Pedro');
  });
});

it('ErrorReglaNegocio expone código y estado 422', () => {
  const e = new ErrorReglaNegocio('X', 'mensaje');
  expect(e.status).toBe(422);
  expect(e.codigo).toBe('X');
});
