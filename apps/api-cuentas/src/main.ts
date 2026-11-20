// Raíz de composición de api-cuentas (inyección de dependencias manual).
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
import {
  CalcularFlujo,
  ConsultarCuenta,
  ConsultarMovimientos,
  ConsultarPosicion,
  GenerarEstadoCuenta,
} from './aplicacion/casos-uso.js';
import { RepositorioCuentasPrisma, RepositorioMovimientosPrisma } from './infraestructura/repositorios-prisma.js';
import { registrarRutas } from './http/rutas.js';

const config = cargarConfig({ ...camposConfigBD, JWT_LLAVE_PUBLICA_ARCHIVO: z.string() });
const db = crearClienteCore(opcionesConexion(config));

const { app } = await crearServidor({
  nombre: 'api-cuentas',
  config,
  verificarListo: async () => {
    await db.cuenta.count({ take: 1 });
  },
});

const cuentas = new RepositorioCuentasPrisma(db);
const movimientos = new RepositorioMovimientosPrisma(db);

registrarRutas(app, {
  verificador: new VerificadorJwt(config.JWT_LLAVE_PUBLICA_ARCHIVO),
  consultarPosicion: new ConsultarPosicion(cuentas),
  consultarCuenta: new ConsultarCuenta(cuentas),
  consultarMovimientos: new ConsultarMovimientos(cuentas, movimientos),
  generarEstadoCuenta: new GenerarEstadoCuenta(cuentas, movimientos),
  calcularFlujo: new CalcularFlujo(cuentas, movimientos),
});

await iniciar(app, config.PORT, () => db.$disconnect());
