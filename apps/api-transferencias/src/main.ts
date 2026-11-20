// Raíz de composición de api-transferencias.
import { z } from 'zod';
import { crearClienteCore } from '@bancagt/db-core';
import {
  VerificadorJwt,
  camposConfigBD,
  cargarConfig,
  crearServidor,
  iniciar,
  opcionesConexion,
} from '@bancagt/plataforma';
import { RealizarTransferencia } from './aplicacion/transferir.js';
import { ConsultarLimites, ConsultarTransferencias, GestionarBeneficiarios } from './aplicacion/consultas.js';
import type { ObservadorTransferencias, Reloj } from './aplicacion/puertos.js';
import {
  ProcesadorTransferenciasPrisma,
  RepositorioBeneficiariosPrisma,
  RepositorioCuentasPrisma,
  RepositorioTransferenciasPrisma,
} from './infraestructura/prisma.js';
import { registrarRutas } from './http/rutas.js';

const config = cargarConfig({ ...camposConfigBD, JWT_LLAVE_PUBLICA_ARCHIVO: z.string() });
const db = crearClienteCore(opcionesConexion(config));

const { app, metricas } = await crearServidor({
  nombre: 'api-transferencias',
  config,
  verificarListo: async () => {
    await db.transferencia.count({ take: 1 });
  },
});

const reloj: Reloj = { ahora: () => new Date() };
// Observer: el resultado de cada transferencia alimenta una métrica de negocio.
const observador: ObservadorTransferencias = {
  registrar: (resultado, codigo) =>
    metricas.operacionesNegocio.inc({ operacion: 'transferencia', resultado: codigo ? `${resultado}:${codigo}` : resultado }),
};

const cuentas = new RepositorioCuentasPrisma(db);
const beneficiarios = new RepositorioBeneficiariosPrisma(db);
const transferencias = new RepositorioTransferenciasPrisma(db);

registrarRutas(app, {
  verificador: new VerificadorJwt(config.JWT_LLAVE_PUBLICA_ARCHIVO),
  realizar: new RealizarTransferencia(
    cuentas,
    beneficiarios,
    transferencias,
    new ProcesadorTransferenciasPrisma(db, transferencias),
    reloj,
    observador,
  ),
  consultar: new ConsultarTransferencias(transferencias),
  limites: new ConsultarLimites(transferencias, reloj),
  beneficiarios: new GestionarBeneficiarios(cuentas, beneficiarios),
});

await iniciar(app, config.PORT, () => db.$disconnect());
