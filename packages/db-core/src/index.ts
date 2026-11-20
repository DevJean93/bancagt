import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';

export interface OpcionesConexion {
  host: string;
  puerto: number;
  baseDatos: string;
  usuario: string;
  /** Función: se evalúa en cada conexión nueva (rotación de credenciales sin reinicio). */
  contrasena: () => string;
  /** Ruta a la CA del clúster PostgreSQL. Si se indica, TLS verificado es obligatorio. */
  rutaCa?: string;
  maxConexiones?: number;
}

/**
 * Factory del cliente Prisma con el driver adapter de node-postgres.
 * TLS verificado contra la CA de CloudNativePG (PCI-DSS 4.2.1).
 */
export function crearClienteCore(op: OpcionesConexion): PrismaClient {
  const adapter = new PrismaPg({
    host: op.host,
    port: op.puerto,
    database: op.baseDatos,
    user: op.usuario,
    password: op.contrasena,
    ssl: op.rutaCa ? { ca: readFileSync(op.rutaCa, 'utf8'), rejectUnauthorized: true } : false,
    max: op.maxConexiones ?? 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
  }, { schema: 'core' });
  return new PrismaClient({ adapter });
}
