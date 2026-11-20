// Job de base de datos (Argo CD lo ejecuta en cada sincronización, antes de
// desplegar las APIs):
//   1. prisma migrate deploy  → aplica SOLO las migraciones pendientes (idempotente)
//   2. datos semilla           → solo si la base está vacía
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { crearClienteCore } from '@bancagt/db-core';
import { crearClienteIdentidad } from '@bancagt/db-identidad';
import { camposConfigBD, cargarConfig, leerSecreto, opcionesConexion } from '@bancagt/plataforma';
import { sembrar } from './semilla.js';

const config = cargarConfig({
  ...camposConfigBD,
  DEMO_CONTRASENA_ARCHIVO: z.string().optional(),
  DEMO_CONTRASENA: z.string().min(8).default('BancaGT#2026'),
  SEMBRAR: z.enum(['si', 'no']).default('si'),
});

const log = (mensaje: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ ts: new Date().toISOString(), servicio: 'db-migraciones', mensaje, ...extra }));

const conexion = opcionesConexion(config);
const requerir = createRequire(import.meta.url);
const cliPrisma = join(dirname(requerir.resolve('prisma/package.json')), 'build', 'index.js');

/** URL para el motor de migraciones (TLS obligatorio con verificación de la CA). */
function urlMigracion(esquema: string): string {
  const u = new URL(`postgresql://${conexion.host}:${conexion.puerto}/${conexion.baseDatos}`);
  u.username = conexion.usuario;
  u.password = conexion.contrasena();
  u.searchParams.set('schema', esquema);
  if (conexion.rutaCa) {
    u.searchParams.set('sslmode', 'require');
    u.searchParams.set('sslrootcert', conexion.rutaCa);
    u.searchParams.set('sslaccept', 'strict');
  }
  return u.toString();
}

function migrar(paquete: string, esquema: string): void {
  const dir = dirname(requerir.resolve(`${paquete}/package.json`));
  log('Aplicando migraciones', { paquete, esquema });
  const r = spawnSync(process.execPath, [cliPrisma, 'migrate', 'deploy', '--config', join(dir, 'prisma.config.ts')], {
    cwd: dir,
    env: { ...process.env, DATABASE_URL: urlMigracion(esquema), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error(`prisma migrate deploy falló para ${esquema} (código ${r.status})`);
}

migrar('@bancagt/db-core', 'core');
migrar('@bancagt/db-identidad', 'identidad');

if (config.SEMBRAR === 'si') {
  const core = crearClienteCore(conexion);
  const identidad = crearClienteIdentidad(conexion);
  try {
    const contrasena = config.DEMO_CONTRASENA_ARCHIVO ? leerSecreto(config.DEMO_CONTRASENA_ARCHIVO) : config.DEMO_CONTRASENA;
    const r = await sembrar(core, identidad, contrasena);
    log(r ? 'Datos semilla cargados' : 'La base ya tenía datos: semilla omitida', { ...r });
  } finally {
    await Promise.all([core.$disconnect(), identidad.$disconnect()]);
  }
}
log('Base de datos lista');
