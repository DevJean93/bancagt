import { readFileSync } from 'node:fs';
import { z } from 'zod';

// Configuración validada al arrancar (fail-fast): si falta una variable o
// tiene un formato inválido, el proceso no inicia y el pod no queda "Ready".

export const esquemaConfigBase = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  APP_VERSION: z.string().default('dev'),
  APP_ENV: z.string().default('local'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Origen público del portal: se exige en Origin para métodos que modifican (anti-CSRF).
  ORIGEN_PERMITIDO: z.string().url().default('https://banca.127.0.0.1.nip.io'),
  // Inyección de fallas para la demo del canary (no afecta /health ni /ready).
  FAULT_RATE: z.coerce.number().min(0).max(1).default(0),
  FAULT_LATENCY_MS: z.coerce.number().int().min(0).default(0),
});

export type ConfigBase = z.infer<typeof esquemaConfigBase>;

/** Conexión a PostgreSQL: usuario y contraseña llegan como archivos montados. */
export const camposConfigBD = {
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().default('banca'),
  DB_USER_FILE: z.string().optional(),
  DB_USER: z.string().default('banca'),
  DB_PASSWORD_FILE: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSL_CA: z.string().optional(),
};

export interface ConfigBD {
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER_FILE?: string | undefined;
  DB_USER: string;
  DB_PASSWORD_FILE?: string | undefined;
  DB_PASSWORD?: string | undefined;
  DB_SSL_CA?: string | undefined;
}

/** Traduce la configuración a las opciones que esperan los clientes Prisma. */
export function opcionesConexion(c: ConfigBD) {
  return {
    host: c.DB_HOST,
    puerto: c.DB_PORT,
    baseDatos: c.DB_NAME,
    usuario: c.DB_USER_FILE ? leerSecreto(c.DB_USER_FILE) : c.DB_USER,
    // Función: la contraseña se relee en cada conexión nueva (rotación sin reinicio).
    contrasena: () => (c.DB_PASSWORD_FILE ? leerSecreto(c.DB_PASSWORD_FILE) : (c.DB_PASSWORD ?? '')),
    ...(c.DB_SSL_CA ? { rutaCa: c.DB_SSL_CA } : {}),
  };
}

export function cargarConfig<T extends z.ZodRawShape>(
  extension: T,
  entorno: NodeJS.ProcessEnv = process.env,
): ConfigBase & z.infer<z.ZodObject<T>> {
  const esquema = esquemaConfigBase.extend(extension);
  const resultado = esquema.safeParse(entorno);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida → ${problemas}`);
  }
  return resultado.data as ConfigBase & z.infer<z.ZodObject<T>>;
}

/**
 * Lee un secreto montado como archivo (Secret de Kubernetes sincronizado desde
 * Vault). Se lee en cada llamada: si Vault rota el secreto, el kubelet
 * actualiza el archivo y el valor nuevo se toma sin reiniciar.
 */
export function leerSecreto(ruta: string): string {
  return readFileSync(ruta, 'utf8').trim();
}
