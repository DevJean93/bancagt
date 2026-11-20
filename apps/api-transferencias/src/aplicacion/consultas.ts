import { Dinero, ErrorNoEncontrado, ErrorReglaNegocio, type Moneda } from '@bancagt/plataforma';
import { enmascararNumero, enmascararTitular, inicioDelDiaGuatemala, type Beneficiario, type Transferencia } from '../dominio/modelos.js';
import { LIMITES } from '../dominio/reglas.js';
import type { Reloj, RepositorioBeneficiarios, RepositorioCuentas, RepositorioTransferencias } from './puertos.js';

export class ConsultarTransferencias {
  constructor(private readonly repo: RepositorioTransferencias) {}

  listar(clienteId: string, pagina: number, tamano: number) {
    return this.repo.listar(clienteId, pagina, tamano);
  }

  async comprobante(id: string, clienteId: string): Promise<Transferencia> {
    const t = await this.repo.obtener(id, clienteId);
    if (!t) throw new ErrorNoEncontrado('Transferencia no encontrada');
    return t;
  }
}

export class ConsultarLimites {
  constructor(
    private readonly repo: RepositorioTransferencias,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(clienteId: string) {
    const desde = inicioDelDiaGuatemala(this.reloj.ahora());
    return Promise.all(
      (Object.keys(LIMITES) as Moneda[]).map(async (moneda) => {
        const usado = await this.repo.totalATercerosDesde(clienteId, moneda, desde);
        const l = LIMITES[moneda];
        return {
          moneda,
          porOperacion: l.porOperacion.aTexto(),
          diarioTerceros: l.diarioTerceros.aTexto(),
          usadoHoy: usado.aTexto(),
          disponibleHoy: Dinero.cero(moneda).esMayorQue(l.diarioTerceros.restar(usado))
            ? '0.00'
            : l.diarioTerceros.restar(usado).aTexto(),
        };
      }),
    );
  }
}

const MAX_BENEFICIARIOS = 25;

export class GestionarBeneficiarios {
  constructor(
    private readonly cuentas: RepositorioCuentas,
    private readonly beneficiarios: RepositorioBeneficiarios,
  ) {}

  listar(clienteId: string): Promise<Beneficiario[]> {
    return this.beneficiarios.listar(clienteId);
  }

  /** Muestra datos mínimos para confirmar el destino, sin exponer el nombre completo. */
  async consultarTitular(numero: string, clienteId: string) {
    const c = await this.cuentas.porNumero(numero);
    if (!c || c.estado === 'CERRADA') throw new ErrorNoEncontrado('No existe una cuenta activa con ese número');
    return {
      numeroEnmascarado: enmascararNumero(c.numero),
      titular: enmascararTitular(c.titular),
      tipo: c.tipo,
      moneda: c.moneda,
      esPropia: c.clienteId === clienteId,
    };
  }

  async agregar(clienteId: string, numero: string, alias: string): Promise<Beneficiario> {
    const c = await this.cuentas.porNumero(numero);
    if (!c || c.estado === 'CERRADA') throw new ErrorNoEncontrado('No existe una cuenta activa con ese número');
    if (c.clienteId === clienteId) {
      throw new ErrorReglaNegocio('CUENTA_PROPIA', 'Sus propias cuentas ya están disponibles para transferir');
    }
    if (await this.beneficiarios.existe(clienteId, c.id)) {
      throw new ErrorReglaNegocio('BENEFICIARIO_DUPLICADO', 'Esa cuenta ya está registrada como beneficiario');
    }
    if ((await this.beneficiarios.contar(clienteId)) >= MAX_BENEFICIARIOS) {
      throw new ErrorReglaNegocio('LIMITE_BENEFICIARIOS', `Puede registrar hasta ${MAX_BENEFICIARIOS} beneficiarios`);
    }
    return this.beneficiarios.crear(clienteId, c.id, alias);
  }

  async eliminar(id: string, clienteId: string): Promise<void> {
    if (!(await this.beneficiarios.eliminar(id, clienteId))) throw new ErrorNoEncontrado('Beneficiario no encontrado');
  }
}
