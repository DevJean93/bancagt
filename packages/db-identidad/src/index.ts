import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

export interface OpcionesConexion {
  host: string;
  puerto: number;
  baseDatos: string;
  usuario: string;
  contrasena: () => string;
  rutaCa?: string;
  maxConexiones?: number;
}

export function crearClienteIdentidad(op: OpcionesConexion): PrismaClient {
  const adapter = new PrismaPg({
    host: op.host,
    port: op.puerto,
    database: op.baseDatos,
    user: op.usuario,
    password: op.contrasena,
    ssl: op.rutaCa ? { ca: readFileSync(op.rutaCa, 'utf8'), rejectUnauthorized: true } : false,
    max: op.maxConexiones ?? 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
  }, { schema: 'identidad' });
  return new PrismaClient({ adapter });
}
